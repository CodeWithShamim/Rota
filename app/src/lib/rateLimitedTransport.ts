/**
 * Arc's public RPC rate-limits **per JSON-RPC call**, not per HTTP request: a
 * single POST carrying 30 calls comes back with ~4 results and 26
 * `{ error: "request limit reached" }` entries (in a 200 response), and rapid
 * single calls 429 about 1 in 3. The bucket allows a small burst then refills a
 * few calls/sec. Batching therefore does NOT raise throughput — only metering
 * the call rate does.
 *
 * This transport meters outgoing calls through a token bucket (burst + steady
 * refill), packs whatever is ready into one POST to save round-trips, and
 * retries any call the limiter rejects — whether it comes back as HTTP 429 or as
 * a "request limit reached" JSON-RPC error inside a 200. Genuine RPC errors
 * (reverts, bad params) are surfaced to the caller unchanged.
 *
 * Contract reads still collapse via multicall3 (one eth_call = one token), so a
 * typical screen costs only a handful of tokens.
 */
import { RpcRequestError, createTransport, type EIP1193RequestFn, type Transport } from "viem";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Pending {
  request: { method: string; params?: unknown };
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  attempts: number;
}

interface RpcError {
  code?: number;
  message?: string;
  data?: unknown;
}

/**
 * True only for genuine throttling ("request limit reached", "rate limit
 * exceeded", "too many requests"). Deliberately NOT a loose `includes("limit")`
 * — Arc's range error "eth_getLogs is limited to a 10,000 range" (-32614) and
 * "query exceeds max results" also contain "limit"/"exceeds" but are permanent,
 * so retrying them would loop 12× then fail. Those fall through to the caller.
 */
function isRateLimit(error?: RpcError): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === 429 ||
    error.code === -32005 || // EIP-1474 "limit exceeded" (rate)
    msg.includes("request limit") ||
    msg.includes("rate limit") ||
    msg.includes("too many") ||
    msg.includes("throttl")
  );
}

interface Options {
  /** bucket capacity — how many calls may burst before metering kicks in */
  burst?: number;
  /** ms to regenerate one token (steady-state call spacing) */
  refillMs?: number;
  /** max calls packed into a single POST */
  batchSize?: number;
  /** per-call retries before giving up */
  maxRetries?: number;
}

export function rateLimitedHttp(url: string, options: Options = {}): Transport {
  // Tuned to Arc's observed limit: single calls clear cleanly at ~1 per 350ms
  // with a burst of ~4. We stay under that — burst 3, ~1 token per 450ms — so
  // steady-state polling rarely triggers a retry.
  const { burst = 3, refillMs = 450, batchSize = 3, maxRetries = 12 } = options;

  const queue: Pending[] = [];
  let tokens = burst;
  let lastRefill = Date.now();
  let pumping = false;
  let nextId = 0;

  const refill = () => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + (now - lastRefill) / refillMs);
    lastRefill = now;
  };

  const requeue = (items: Pending[], backoffMs = 0) => {
    const live: Pending[] = [];
    for (const p of items) {
      p.attempts += 1;
      if (p.attempts > maxRetries) {
        p.reject(new Error(`Arc RPC rate limit: gave up after ${maxRetries} retries`));
      } else {
        live.push(p);
      }
    }
    if (live.length === 0) return;
    const resume = () => {
      queue.unshift(...live);
      void pump();
    };
    if (backoffMs > 0) setTimeout(resume, backoffMs);
    else resume();
  };

  async function send(batch: Pending[]) {
    const body = batch.map((p) => ({
      jsonrpc: "2.0" as const,
      id: ++nextId,
      method: p.request.method,
      params: (p.request.params as unknown[]) ?? [],
    }));

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      requeue(batch, 500); // network blip — back off then retry the whole batch
      return;
    }

    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      const retryAfter = Number(res.headers.get("retry-after"));
      requeue(batch, retryAfter ? retryAfter * 1000 : refillMs);
      return;
    }
    if (!res.ok) {
      const err = new Error(`Arc RPC HTTP ${res.status}`);
      for (const p of batch) p.reject(err);
      return;
    }

    const json = (await res.json()) as unknown;
    const list = Array.isArray(json) ? json : [json];
    const byId = new Map<number, { id: number; result?: unknown; error?: RpcError }>(
      list.map((r) => [(r as { id: number }).id, r as never])
    );

    const throttled: Pending[] = [];
    for (let i = 0; i < body.length; i++) {
      const r = byId.get(body[i].id);
      const p = batch[i];
      if (!r) {
        p.reject(new Error("missing RPC response for batched call"));
      } else if (isRateLimit(r.error)) {
        throttled.push(p);
      } else if (r.error) {
        p.reject(
          new RpcRequestError({
            body: body[i],
            error: { code: r.error.code ?? -32603, message: r.error.message ?? "unknown error", data: r.error.data },
            url,
          })
        );
      } else {
        p.resolve(r.result);
      }
    }
    if (throttled.length > 0) requeue(throttled);
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length > 0) {
        refill();
        if (tokens < 1) {
          await sleep(Math.ceil((1 - tokens) * refillMs));
          continue;
        }
        const take = Math.min(Math.floor(tokens), batchSize, queue.length);
        const batch = queue.splice(0, take);
        tokens -= take;
        void send(batch); // token bucket—not await—governs the send rate
      }
    } finally {
      pumping = false;
    }
  }

  return () =>
    createTransport({
      key: "rate-limited-http",
      name: "Rate-limited HTTP",
      type: "http",
      retryCount: 0, // retries handled per-call inside send()
      request: ((args: Pending["request"]) =>
        new Promise<unknown>((resolve, reject) => {
          queue.push({ request: args, resolve, reject, attempts: 0 });
          void pump();
        })) as EIP1193RequestFn,
    });
}

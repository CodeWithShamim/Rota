/**
 * Fetch a contract's event logs from the Arcscan (Blockscout) indexer API.
 *
 * Why: reading history over raw RPC means chunked eth_getLogs scans — Arc caps
 * ranges at 10,000 blocks and the archive gateway meters calls, so a full-chain
 * backfill costs ~80 throttled requests (minutes). The explorer has the whole
 * history indexed and returns it in ONE call. hooks/useRota.ts uses this for the
 * deep backfill and falls back to the RPC scan when the explorer is down.
 *
 * Classic Blockscout endpoint: /api?module=logs&action=getLogs. Responses cap at
 * 1,000 records per call — far above what a circle/pot ever emits; if a contract
 * did exceed it, the RPC fallback still guarantees completeness for the tail
 * because callers re-scan anything newer than the returned range.
 */
import { parseEventLogs, type Abi, type Hex, type Log } from "viem";

interface RawExplorerLog {
  topics: (Hex | null)[];
  data: Hex;
  blockNumber: Hex;
  logIndex: Hex;
  transactionHash: Hex;
}

export interface ExplorerLogItem {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  txHash: string;
}

export async function fetchExplorerLogs(
  explorerBaseUrl: string,
  address: string,
  abi: Abi,
  fromBlock: bigint,
  toBlock: bigint
): Promise<ExplorerLogItem[]> {
  const url =
    `${explorerBaseUrl}/api?module=logs&action=getLogs` +
    `&address=${address}&fromBlock=${fromBlock}&toBlock=${toBlock}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`explorer API HTTP ${res.status}`);
  const json = (await res.json()) as { message?: string; result?: unknown };
  // "No records found" still returns result: [] — only a non-array result is an error
  if (!Array.isArray(json.result)) throw new Error(`explorer API: ${json.message ?? "bad response"}`);
  const raw = json.result as RawExplorerLog[];

  // The classic API omits blockHash/transactionIndex/removed; fill them with
  // placeholders — parseEventLogs only decodes topics+data and passes the rest
  // through untouched.
  const parsed = parseEventLogs({
    abi,
    logs: raw.map(
      (l) =>
        ({
          address: address as Hex,
          topics: l.topics.filter((t): t is Hex => t !== null),
          data: l.data,
          blockNumber: BigInt(l.blockNumber),
          blockHash: null,
          logIndex: Number(l.logIndex),
          transactionHash: l.transactionHash,
          transactionIndex: null,
          removed: false,
        }) as unknown as Log
    ),
  });

  return parsed
    .map((l) => ({
      eventName: (l as { eventName?: string }).eventName ?? "",
      args: ((l as { args?: Record<string, unknown> }).args ?? {}) as Record<string, unknown>,
      blockNumber: l.blockNumber ?? 0n,
      logIndex: l.logIndex ?? 0,
      txHash: l.transactionHash ?? "",
    }))
    .sort((a, b) =>
      a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : Number(a.blockNumber - b.blockNumber)
    );
}

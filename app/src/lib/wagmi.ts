import { fallback, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { ARC_ARCHIVE_RPC, ARC_DEDICATED_RPC, ARC_FAST_RPC, arcTestnet, localAnvil } from "../config/chain";
import { rateLimitedHttp } from "./rateLimitedTransport";

/**
 * Arc transport strategy (endpoints ranked in config/chain.ts):
 * - With a dedicated endpoint (VITE_ARC_RPC_URL): plain batched http, full speed.
 * - Public infra: Blockdaemon gateway first — generous limits, handles all state
 *   reads/multicalls/receipts — with the primary archive gateway behind it via
 *   fallback(). Blockdaemon is pruned, so deep-history eth_getLogs fails there
 *   fast ("pruned history unavailable") and falls over to the archive, which is
 *   metered by rateLimitedHttp to stay under its ~4-call token bucket.
 * retryCount 0 on the fast leg: deterministic errors (pruned history) shouldn't
 * be retried in place — fallback moves them to the archive immediately.
 */
const arcTransport = ARC_DEDICATED_RPC
  ? http(ARC_DEDICATED_RPC, { batch: true })
  : fallback([
      http(ARC_FAST_RPC, { batch: { batchSize: 20 }, retryCount: 0 }),
      rateLimitedHttp(ARC_ARCHIVE_RPC),
    ]);

// Both chains are registered; the app gates actions on `activeChain` (VITE_CHAIN).
export const wagmiConfig = createConfig({
  chains: [arcTestnet, localAnvil],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: arcTransport,
    [localAnvil.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

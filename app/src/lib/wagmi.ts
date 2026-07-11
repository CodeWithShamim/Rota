import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet, localAnvil } from "../config/chain";

// Both chains are registered; the app gates actions on `activeChain` (VITE_CHAIN).
export const wagmiConfig = createConfig({
  chains: [arcTestnet, localAnvil],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
    [localAnvil.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

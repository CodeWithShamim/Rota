/**
 * Privy auth configuration. Privy owns the connection layer (email/social
 * login, embedded wallets, external wallets); @privy-io/wagmi bridges the
 * resulting wallet into wagmi so every data hook keeps working unchanged.
 * Login methods are controlled from the Privy dashboard (dashboard.privy.io).
 */
import type { PrivyClientConfig } from "@privy-io/react-auth";
import { activeChain, arcTestnet, localAnvil } from "../config/chain";

export const PRIVY_APP_ID: string | undefined =
  import.meta.env.VITE_PRIVY_APP_ID || undefined;

export const privyConfig: PrivyClientConfig = {
  appearance: {
    // provider config is fixed at boot; matches the pre-paint theme class
    theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    accentColor: "#059669", // brand-600
    walletChainType: "ethereum-only",
  },
  defaultChain: activeChain,
  supportedChains: [arcTestnet, localAnvil],
  embeddedWallets: {
    ethereum: { createOnLogin: "users-without-wallets" },
  },
};

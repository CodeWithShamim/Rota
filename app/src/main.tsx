import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./hooks/toast";
import "./i18n";
import "./index.css";
import { PRIVY_APP_ID, privyConfig } from "./lib/privy";
import { wagmiConfig } from "./lib/wagmi";

// refetchOnWindowFocus defaults to true, so every tab focus refetches *all*
// active queries at once — a burst that trips Arc's RPC rate limiter (429).
// Disable it; the per-query refetchInterval + live event-watch keep data fresh.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

function MissingPrivyConfig() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-6 dark:bg-stone-950">
      <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-700 shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
        <p className="mb-2 text-base font-semibold text-stone-900 dark:text-stone-100">
          Privy is not configured
        </p>
        <p>
          Set <code className="font-mono">VITE_PRIVY_APP_ID</code> in{" "}
          <code className="font-mono">.env.local</code> at the repo root to your app ID from{" "}
          <a
            className="font-semibold text-brand-700 hover:underline dark:text-brand-400"
            href="https://dashboard.privy.io"
            target="_blank"
            rel="noreferrer"
          >
            dashboard.privy.io
          </a>
          , then restart the dev server.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {PRIVY_APP_ID ? (
      <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>
            <ToastProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </ToastProvider>
          </WagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    ) : (
      <MissingPrivyConfig />
    )}
  </StrictMode>
);

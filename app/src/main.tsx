import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import App from "./App";
import { ToastProvider } from "./hooks/toast";
import "./i18n";
import "./index.css";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);

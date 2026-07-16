import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Read .env/.env.local from the repo root (single env file for contracts + app).
  // Only VITE_-prefixed vars are exposed to the client, so PRIVATE_KEY never leaks.
  envDir: "..",
  build: {
    rollupOptions: {
      output: {
        // Split the heavyweight vendors out of the app chunk so the browser can
        // cache them across deploys and parse the app code sooner.
        manualChunks: {
          ethereum: ["viem", "wagmi", "@tanstack/react-query"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});

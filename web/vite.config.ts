import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O painel fala com o proxy local (proxy/server.mjs) em http://localhost:8787.
// Em dev, encaminhamos /proxy -> 8787 para evitar depender de CORS; o endpoint
// real continua configurável na página DB/Config (lib/api.ts).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/proxy": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy/, ""),
      },
    },
  },
});

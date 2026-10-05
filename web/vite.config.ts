import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O painel roda como página da própria extensão (chrome-extension://.../panel/index.html),
// não em servidor separado: o build gera direto dentro de extension/build/panel, e ele fala
// com o background da extensão via chrome.runtime.sendMessage (lib/api.ts).
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "../extension/build/panel",
    emptyOutDir: true,
  },
});

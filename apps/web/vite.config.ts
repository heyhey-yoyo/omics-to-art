import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@omics-to-art/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "@omics-to-art/data-engine": fileURLToPath(new URL("../../packages/data-engine/src/index.ts", import.meta.url)),
      "@omics-to-art/art-engine": fileURLToPath(new URL("../../packages/art-engine/src/index.ts", import.meta.url)),
      "@omics-to-art/templates": fileURLToPath(new URL("../../packages/templates/src/index.ts", import.meta.url))
    }
  },
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 850
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  }
});

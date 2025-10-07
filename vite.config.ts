import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: ".",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      // External modules that shouldn't be bundled
      external: [],
    },
  },
  worker: {
    format: "es",
    plugins: [wasm(), topLevelAwait()],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

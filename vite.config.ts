import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  // WASM plugins only in dev mode - production externalizes tiktoken anyway
  // This prevents mermaid initialization errors in production while allowing dev to work
  plugins: mode === "development" ? [react(), wasm(), topLevelAwait()] : [react()],
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
    minify: "esbuild",
    rollupOptions: {
      // Exclude tiktoken from renderer bundle - it's never used there (only in main process)
      external: ["@dqbd/tiktoken"],
      output: {
        format: "es",
        inlineDynamicImports: false,
        sourcemapExcludeSources: false,
      },
    },
    chunkSizeWarningLimit: 2000,
    target: "esnext",
  },
  worker: {
    format: "es",
    // Web workers need WASM plugin for tiktoken in tokenStats.worker.ts
    plugins: [wasm(), topLevelAwait()],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ["@dqbd/tiktoken"],
    esbuildOptions: {
      target: "esnext",
    },
  },
}));

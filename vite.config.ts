import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const disableMermaid = process.env.VITE_DISABLE_MERMAID === "1";

const alias: Record<string, string> = {
  "@": path.resolve(__dirname, "./src"),
};

if (disableMermaid) {
  alias["mermaid"] = path.resolve(__dirname, "./src/mocks/mermaidStub.ts");
}

export default defineConfig(({ mode }) => ({
  // This prevents mermaid initialization errors in production while allowing dev to work
  plugins: mode === "development" ? [react(), topLevelAwait()] : [react()],
  resolve: {
    alias,
  },
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: ".",
    emptyOutDir: false,
    sourcemap: true,
    minify: "esbuild",
    rollupOptions: {
      // Exclude ai-tokenizer from renderer bundle - it's never used there (only in main process)
      external: ["ai-tokenizer"],
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
    plugins: [topLevelAwait()],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts: ["localhost", "127.0.0.1"],
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    allowedHosts: ["localhost", "127.0.0.1"],
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
}));

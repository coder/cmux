import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import topLevelAwait from "vite-plugin-top-level-await";
import svgr from "vite-plugin-svgr";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const disableMermaid = process.env.VITE_DISABLE_MERMAID === "1";
const devServerPort = Number(process.env.CMUX_VITE_PORT ?? "5173");
const previewPort = Number(process.env.CMUX_VITE_PREVIEW_PORT ?? "4173");

const alias: Record<string, string> = {
  "@": path.resolve(__dirname, "./src"),
};

if (disableMermaid) {
  alias["mermaid"] = path.resolve(__dirname, "./src/mocks/mermaidStub.ts");
}

export default defineConfig(({ mode }) => ({
  // This prevents mermaid initialization errors in production while allowing dev to work
  plugins: mode === "development" ? [svgr(), react(), topLevelAwait()] : [svgr(), react()],
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
    port: devServerPort,
    strictPort: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    sourcemapIgnoreList: () => false, // Show all sources in DevTools
  },
  preview: {
    host: "127.0.0.1",
    port: previewPort,
    strictPort: true,
    allowedHosts: ["localhost", "127.0.0.1"],
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
}));

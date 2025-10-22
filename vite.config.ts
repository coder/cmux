import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import topLevelAwait from "vite-plugin-top-level-await";
import svgr from "vite-plugin-svgr";
import tailwindcss from "@tailwindcss/vite";
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

// React Compiler configuration
// Automatically optimizes React components through memoization
// See: https://react.dev/learn/react-compiler
const reactCompilerConfig = {
  target: "18", // Target React 18 (requires react-compiler-runtime package)
};

// Babel plugins configuration (shared between dev and production)
const babelPlugins = [
  ["babel-plugin-react-compiler", reactCompilerConfig],
];

// Base plugins for both dev and production
const basePlugins = [
  svgr(),
  react({
    babel: {
      plugins: babelPlugins,
    },
  }),
  tailwindcss(),
];

export default defineConfig(({ mode }) => ({
  // This prevents mermaid initialization errors in production while allowing dev to work
  plugins: mode === "development" ? [...basePlugins, topLevelAwait()] : basePlugins,
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
        manualChunks(id) {
          const normalizedId = id.split(path.sep).join("/");
          if (normalizedId.includes("node_modules/ai-tokenizer/encoding/")) {
            const chunkName = path.basename(id, path.extname(id));
            return `tokenizer-encoding-${chunkName}`;
          }
          if (normalizedId.includes("node_modules/ai-tokenizer/")) {
            return "tokenizer-base";
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 2000,
    target: "esnext",
  },
  worker: {
    format: "es",
    plugins: () => [topLevelAwait()],
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

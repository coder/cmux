import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const disableMermaid = process.env.VITE_DISABLE_MERMAID === "1";

// Vite server configuration (for dev-server remote access)
const devServerHost = process.env.MUX_VITE_HOST ?? "127.0.0.1"; // Secure by default
const devServerPort = Number(process.env.MUX_VITE_PORT ?? "5173");
const previewPort = Number(process.env.MUX_VITE_PREVIEW_PORT ?? "4173");

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
const babelPlugins = [["babel-plugin-react-compiler", reactCompilerConfig]];

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

export default defineConfig(async ({ mode }) => {
  // Dynamically import topLevelAwait only in dev mode
  const plugins =
    mode === "development"
      ? [...basePlugins, (await import("vite-plugin-top-level-await")).default()]
      : basePlugins;

  return {
  // This prevents mermaid initialization errors in production while allowing dev to work
  plugins,
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
      input: {
        main: path.resolve(__dirname, "index.html"),
        terminal: path.resolve(__dirname, "terminal.html"),
      },
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
    plugins: async () => {
      if (mode === "development") {
        return [(await import("vite-plugin-top-level-await")).default()];
      }
      return [];
    },
  },
  server: {
    host: devServerHost, // Configurable via MUX_VITE_HOST (defaults to 127.0.0.1 for security)
    port: devServerPort,
    strictPort: true,
    allowedHosts: devServerHost === "0.0.0.0" ? undefined : ["localhost", "127.0.0.1"],
    sourcemapIgnoreList: () => false, // Show all sources in DevTools
    hmr: {
      // Configure HMR to use the correct host for remote access
      host: devServerHost,
      port: devServerPort,
      protocol: "ws",
    },
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
  assetsInclude: ["**/*.wasm"],
};
});

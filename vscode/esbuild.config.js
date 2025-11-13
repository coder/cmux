const esbuild = require("esbuild");
const path = require("path");

// Plugin to resolve cmux/* imports from parent directory
// and resolve npm dependencies from main app's node_modules
const cmuxResolverPlugin = {
  name: "cmux-resolver",
  setup(build) {
    // Resolve cmux/* imports to parent src directory
    build.onResolve({ filter: /^cmux\// }, (args) => {
      const subpath = args.path.replace(/^cmux\//, "");
      return {
        path: path.resolve(__dirname, "..", "src", subpath + ".ts"),
      };
    });
  },
};

esbuild
  .build({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    outdir: "out",
    external: ["vscode"],
    platform: "node",
    target: "node20",
    format: "cjs",
    minify: true,
    sourcemap: true,
    plugins: [cmuxResolverPlugin],
    // Resolve @ alias from main app to relative paths
    alias: {
      "@": path.resolve(__dirname, "../src"),
    },
    // Use main app's node_modules for dependencies
    nodePaths: [path.resolve(__dirname, "../node_modules")],
    // Prefer ESM modules over UMD to avoid AMD/require issues
    mainFields: ["module", "main"],
  })
  .catch(() => process.exit(1));

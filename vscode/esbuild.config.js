const esbuild = require("esbuild");
const path = require("path");

// Plugin to resolve cmux/* imports from parent directory
const cmuxResolverPlugin = {
  name: "cmux-resolver",
  setup(build) {
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
  })
  .catch(() => process.exit(1));

#!/bin/bash
# Patch vite-plugin-top-level-await for Bun compatibility
# Bun's Module class doesn't have the same API as Node.js

PLUGIN_FILE="node_modules/vite-plugin-top-level-await/dist/esbuild.js"

if [ ! -f "$PLUGIN_FILE" ]; then
  echo "vite-plugin-top-level-await not found, skipping patch"
  exit 0
fi

# Check if already patched
if grep -q "Bun compatibility" "$PLUGIN_FILE"; then
  echo "vite-plugin-top-level-await already patched"
  exit 0
fi

echo "Patching vite-plugin-top-level-await for Bun compatibility..."

# Create backup
cp "$PLUGIN_FILE" "$PLUGIN_FILE.bak"

# Apply patch
cat > "$PLUGIN_FILE" << 'PATCH'
"use strict";
// Import the `esbuild` package installed by `vite`
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));

// Bun compatibility: Use direct require instead of Module API
function requireFrom(self, contextModuleName, wantedModuleName) {
    try {
        // Try direct require first (works in Bun)
        return require(wantedModuleName);
    } catch (e) {
        // Fallback to Node's Module API if available
        const Module = require("module");
        if (!Module || !Module._resolveFilename) {
            throw e;
        }
        const contextModulePath = Module._resolveFilename(contextModuleName, self);
        const virtualModule = new Module(contextModulePath, module);
        virtualModule.filename = contextModulePath;
        virtualModule.paths = Module._nodeModulePaths(path_1.default.dirname(contextModulePath));
        return virtualModule.require(wantedModuleName);
    }
}
exports.default = requireFrom(module, "vite", "esbuild");
PATCH

echo "✅ Patched vite-plugin-top-level-await"

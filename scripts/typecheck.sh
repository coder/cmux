#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Use tsgo (TypeScript in Go) for 10x faster type checking
# Falls back to tsc if tsgo is not available
if command -v tsgo &> /dev/null || [ -f "node_modules/@typescript/native-preview/bin/tsgo.js" ]; then
  bun x concurrently -g \
    "bun run node_modules/@typescript/native-preview/bin/tsgo.js --noEmit" \
    "bun run node_modules/@typescript/native-preview/bin/tsgo.js --noEmit -p tsconfig.main.json"
else
  echo "⚠️  tsgo not found, falling back to tsc (slower)"
  bun x concurrently -g \
    "tsc --noEmit" \
    "tsc --noEmit -p tsconfig.main.json"
fi

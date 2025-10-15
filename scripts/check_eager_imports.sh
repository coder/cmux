#!/usr/bin/env bash
# Detects eager imports of heavy packages in startup-critical and renderer/worker files
#
# Main process: AI SDK packages must be lazy-loaded to maintain fast startup (<4s)
# Renderer/Worker: Large data files (models.json) and ai-tokenizer must never be imported

set -euo pipefail

# Files that should NOT have eager AI SDK imports (main process)
CRITICAL_FILES=(
  "src/main.ts"
  "src/config.ts"
  "src/preload.ts"
)

# Packages banned in main process (lazy load only)
BANNED_MAIN_IMPORTS=(
  "@ai-sdk/anthropic"
  "@ai-sdk/openai"
  "@ai-sdk/google"
  "ai"
)

# Packages banned in renderer/worker (never import)
BANNED_RENDERER_IMPORTS=(
  "ai-tokenizer"
)

# Files banned in renderer/worker (large data files)
BANNED_RENDERER_FILES=(
  "models.json"
)

failed=0

echo "==> Checking for eager AI SDK imports in main process critical files..."

for file in "${CRITICAL_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    continue
  fi

  for pkg in "${BANNED_MAIN_IMPORTS[@]}"; do
    # Check for top-level imports (not dynamic)
    if grep -E "^import .* from ['\"]$pkg" "$file" >/dev/null 2>&1; then
      echo "❌ EAGER IMPORT DETECTED: $file imports '$pkg'"
      echo "   AI SDK packages must use dynamic import() in critical path"
      failed=1
    fi
  done
done

# Also check dist/main.js for require() calls (if it exists)
if [ -f "dist/main.js" ]; then
  echo "==> Checking bundled main.js for eager requires..."
  for pkg in "${BANNED_MAIN_IMPORTS[@]}"; do
    if grep "require(\"$pkg\")" dist/main.js >/dev/null 2>&1; then
      echo "❌ BUNDLED EAGER IMPORT: dist/main.js requires '$pkg'"
      echo "   This means a critical file is importing AI SDK eagerly"
      failed=1
    fi
  done
fi

echo "==> Checking for banned imports in renderer/worker files..."

# Find all TypeScript files in renderer-only directories
RENDERER_DIRS=(
  "src/components"
  "src/contexts"
  "src/hooks"
  "src/stores"
  "src/utils/ui"
  "src/utils/tokens/tokenStats.worker.ts"
  "src/utils/tokens/tokenStatsCalculatorApproximate.ts"
)

for dir in "${RENDERER_DIRS[@]}"; do
  if [ ! -e "$dir" ]; then
    continue
  fi

  # Find all .ts/.tsx files in this directory
  while IFS= read -r -d '' file; do
    # Check for banned packages
    for pkg in "${BANNED_RENDERER_IMPORTS[@]}"; do
      if grep -E "from ['\"]$pkg" "$file" >/dev/null 2>&1; then
        echo "❌ RENDERER IMPORT DETECTED: $file imports '$pkg'"
        echo "   ai-tokenizer must never be imported in renderer (8MB+)"
        failed=1
      fi
    done

    # Check for banned files (e.g., models.json)
    for banned_file in "${BANNED_RENDERER_FILES[@]}"; do
      if grep -E "from ['\"].*$banned_file" "$file" >/dev/null 2>&1; then
        echo "❌ LARGE FILE IMPORT: $file imports '$banned_file'"
        echo "   $banned_file is 701KB and must not be in renderer/worker"
        failed=1
      fi
    done
  done < <(find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" \) -print0)
done

# Check bundled worker if it exists
if [ -f dist/tokenStats.worker-*.js ]; then
  WORKER_FILE=$(find dist -name 'tokenStats.worker-*.js' | head -1)
  WORKER_SIZE=$(wc -c <"$WORKER_FILE" | tr -d ' ')

  echo "==> Checking worker bundle for heavy imports..."

  # If worker is suspiciously large (>50KB), likely has models.json or ai-tokenizer
  if ((WORKER_SIZE > 51200)); then
    echo "❌ WORKER TOO LARGE: $WORKER_FILE is ${WORKER_SIZE} bytes (>50KB)"
    echo "   This suggests models.json (701KB) or ai-tokenizer leaked in"

    # Try to identify what's in there
    if grep -q "models.json" "$WORKER_FILE" 2>/dev/null \
      || strings "$WORKER_FILE" 2>/dev/null | grep -q "anthropic\|openai" | head -10; then
      echo "   Found model names in bundle - likely models.json"
    fi
    failed=1
  fi
fi

if [ $failed -eq 1 ]; then
  echo ""
  echo "Fix suggestions:"
  echo "  Main process: Use dynamic imports"
  echo "    ✅ const { createAnthropic } = await import('@ai-sdk/anthropic');"
  echo "    ❌ import { createAnthropic } from '@ai-sdk/anthropic';"
  echo ""
  echo "  Renderer/Worker: Never import heavy packages"
  echo "    ❌ import { getModelStats } from './modelStats';  // imports models.json"
  echo "    ❌ import AITokenizer from 'ai-tokenizer';  // 8MB package"
  echo "    ✅ Use approximations or IPC to main process"
  exit 1
fi

echo "✅ No banned imports detected"

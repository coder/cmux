#!/usr/bin/env bash
# Check bundle size budgets to prevent regressions
set -euo pipefail

cd "$(dirname "$0")/.."

# Budgets (in bytes)
MAX_INDEX_GZIP=409600 # 400KB gzipped

echo "Checking bundle size budgets..."

# Find the main index bundle
INDEX_FILE=$(find dist -name 'index-*.js' | head -1)
if [[ -z "$INDEX_FILE" ]]; then
  echo "❌ Error: Could not find main index bundle" >&2
  exit 1
fi

# Check index gzipped size
INDEX_SIZE=$(gzip -c "$INDEX_FILE" | wc -c | tr -d ' ')
INDEX_SIZE_KB=$((INDEX_SIZE / 1024))
MAX_INDEX_KB=$((MAX_INDEX_GZIP / 1024))

echo "Main bundle (gzipped): ${INDEX_SIZE_KB}KB (budget: ${MAX_INDEX_KB}KB)"
if ((INDEX_SIZE > MAX_INDEX_GZIP)); then
  echo "❌ Main bundle exceeds budget by $((INDEX_SIZE - MAX_INDEX_GZIP)) bytes" >&2
  exit 1
fi

echo "✅ Bundle size within budget"

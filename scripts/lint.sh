#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

ESLINT_PATTERN='src/**/*.{ts,tsx}'

if [ "$1" = "--fix" ]; then
  echo "Running eslint with --fix..."
  eslint "$ESLINT_PATTERN" --fix
else
  echo "Running eslint..."
  eslint "$ESLINT_PATTERN"
  echo "Running typecheck (renderer)..."
  bun run typecheck
  echo "Running typecheck (main)..."
  bun run typecheck:main
  echo "All lint checks passed!"
fi

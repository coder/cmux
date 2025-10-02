#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

if [ "$1" = "--main" ]; then
  echo "Running typecheck (main)..."
  tsc --noEmit -p tsconfig.main.json
elif [ "$1" = "--renderer" ]; then
  echo "Running typecheck (renderer)..."
  tsc --noEmit
else
  echo "Running typecheck (renderer)..."
  tsc --noEmit
  echo "Running typecheck (main)..."
  tsc --noEmit -p tsconfig.main.json
  echo "All typechecks passed!"
fi

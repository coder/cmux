#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

PRETTIER_PATTERNS=("src/**/*.{ts,tsx,js,jsx,json}" "*.{json,md}")

format_typescript() {
  local mode="$1"
  if [ "$mode" = "--check" ]; then
    echo "Checking TypeScript/JSON/Markdown formatting..."
    prettier --check "${PRETTIER_PATTERNS[@]}"
  else
    echo "Formatting TypeScript/JSON/Markdown files..."
    prettier --write "${PRETTIER_PATTERNS[@]}"
  fi
}

format_shell() {
  if ! command -v shfmt &>/dev/null; then
    echo "shfmt not found. Installing via brew..."
    if command -v brew &>/dev/null; then
      brew install shfmt
    else
      echo "Error: brew not found. Please install shfmt manually:"
      echo "  macOS: brew install shfmt"
      echo "  Linux: apt-get install shfmt or snap install shfmt"
      echo "  Go: go install mvdan.cc/sh/v3/cmd/shfmt@latest"
      exit 1
    fi
  fi
  echo "Formatting shell scripts..."
  shfmt -i 2 -ci -bn -w scripts
}

if [ "$1" = "--check" ]; then
  format_typescript --check
elif [ "$1" = "--shell" ]; then
  format_shell
elif [ "$1" = "--all" ]; then
  format_typescript
  format_shell
else
  format_typescript
fi

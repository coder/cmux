#!/usr/bin/env bash
set -euo pipefail

# Ensure mdbook-mermaid assets are installed
if [ ! -f "docs/mermaid-init.js" ] || [ ! -f "docs/mermaid.min.js" ]; then
  echo "📦 Installing mermaid assets..."
  cd docs && mdbook-mermaid install
  cd ..
fi

# Build the docs
cd docs && mdbook build

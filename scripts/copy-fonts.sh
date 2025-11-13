#!/usr/bin/env bash
# Copy Geist fonts from node_modules to public/fonts
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

mkdir -p "${PROJECT_ROOT}/public/fonts/geist-sans"
mkdir -p "${PROJECT_ROOT}/public/fonts/geist-mono"

# Copy variable fonts (support weights 100-900)
cp "${PROJECT_ROOT}/node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2" \
	"${PROJECT_ROOT}/public/fonts/geist-sans/"

cp "${PROJECT_ROOT}/node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2" \
	"${PROJECT_ROOT}/public/fonts/geist-mono/"

echo "✓ Copied Geist variable fonts to public/fonts/"

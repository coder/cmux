# Build System
# ============
# This Makefile orchestrates the cmux build process.
#
# Quick Start:
#   make help          - Show all available targets
#   make dev           - Start development server with hot reload
#   make build         - Build all targets (parallel when possible)
#   make static-check  - Run all static checks (lint + typecheck + fmt-check)
#   make test          - Run tests
#
# Parallelism:
#   Use make -jN to run independent tasks concurrently (e.g., make -j4 build)
#
# Backwards Compatibility:
#   All commands also work via `bun run` (e.g., `bun run dev` calls `make dev`)
#
# Adding New Targets:
#   Add `## Description` after the target to make it appear in `make help`

# Include formatting rules
include fmt.mk

.PHONY: all build dev start clean help
.PHONY: build-renderer version build-icons
.PHONY: lint lint-fix typecheck static-check
.PHONY: test test-unit test-integration test-watch test-coverage test-e2e
.PHONY: dist dist-mac dist-win dist-linux
.PHONY: docs docs-build docs-watch
.PHONY: benchmark-terminal
.PHONY: ensure-deps

TS_SOURCES := $(shell find src -type f \( -name '*.ts' -o -name '*.tsx' \))

# Default target
all: build

# Sentinel file to track when dependencies are installed
# Depends on package.json and bun.lock - rebuilds if either changes
node_modules/.installed: package.json bun.lock
	@echo "Dependencies out of date or missing, running bun install..."
	@bun install
	@touch node_modules/.installed

# Legacy target for backwards compatibility
ensure-deps: node_modules/.installed

## Help
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

## Development
dev: node_modules/.installed build-main ## Start development server (Vite + TypeScript watcher)
	@bun x concurrently -k \
		"bun x concurrently \"bun x tsc -w -p tsconfig.main.json\" \"bun x tsc-alias -w -p tsconfig.main.json\"" \
		"vite"

start: node_modules/.installed build-main build-preload ## Build and start Electron app
	@bun x electron --remote-debugging-port=9222 .

## Build targets (can run in parallel)
build: node_modules/.installed src/version.ts build-renderer build-main build-preload build-icons ## Build all targets

build-main: node_modules/.installed dist/main.js ## Build main process

dist/main.js: src/version.ts tsconfig.main.json tsconfig.json $(TS_SOURCES)
	@echo "Building main process..."
	@NODE_ENV=production bun x tsc -p tsconfig.main.json
	@NODE_ENV=production bun x tsc-alias -p tsconfig.main.json

build-preload: node_modules/.installed dist/preload.js ## Build preload script

dist/preload.js: src/preload.ts $(TS_SOURCES)
	@echo "Building preload script..."
	@NODE_ENV=production bun build src/preload.ts \
		--format=cjs \
		--target=node \
		--external=electron \
		--sourcemap=inline \
		--outfile=dist/preload.js

build-renderer: node_modules/.installed src/version.ts ## Build renderer process
	@echo "Building renderer..."
	@bun x vite build

# Always regenerate version file (marked as .PHONY above)
version: ## Generate version file
	@./scripts/generate-version.sh

src/version.ts: version

# Platform-specific icon targets
ifeq ($(shell uname), Darwin)
build-icons: build/icon.icns build/icon.png ## Generate Electron app icons from logo (macOS builds both)
else
build-icons: build/icon.png ## Generate Electron app icons from logo (Linux builds PNG only)
endif

# Detect ImageMagick command (magick on v7+, convert on older versions)
MAGICK_CMD := $(shell command -v magick 2>/dev/null || command -v convert 2>/dev/null || echo "magick")

build/icon.png: docs/img/logo.webp
	@echo "Generating Linux icon..."
	@mkdir -p build
	@$(MAGICK_CMD) docs/img/logo.webp -resize 512x512 build/icon.png

build/icon.icns: docs/img/logo.webp
	@echo "Generating macOS icon..."
	@mkdir -p build/icon.iconset
	@for size in 16 32 64 128 256 512; do \
		$(MAGICK_CMD) docs/img/logo.webp -resize $${size}x$${size} build/icon.iconset/icon_$${size}x$${size}.png; \
		if [ $$size -le 256 ]; then \
			double=$$((size * 2)); \
			$(MAGICK_CMD) docs/img/logo.webp -resize $${double}x$${double} build/icon.iconset/icon_$${size}x$${size}@2x.png; \
		fi; \
	done
	@iconutil -c icns build/icon.iconset -o build/icon.icns
	@rm -rf build/icon.iconset

## Quality checks (can run in parallel)
static-check: lint typecheck fmt-check ## Run all static checks

lint: node_modules/.installed ## Run ESLint (typecheck runs in separate target)
	@./scripts/lint.sh

lint-fix: node_modules/.installed ## Run linter with --fix
	@./scripts/lint.sh --fix

typecheck: node_modules/.installed src/version.ts ## Run TypeScript type checking
	@./scripts/typecheck.sh

## Testing
test-integration: node_modules/.installed ## Run all tests (unit + integration)
	@bun test src
	@TEST_INTEGRATION=1 bun x jest tests

test-unit: node_modules/.installed ## Run unit tests
	@bun test src

test: test-unit ## Alias for test-unit

test-watch: ## Run tests in watch mode
	@./scripts/test.sh --watch

test-coverage: ## Run tests with coverage
	@./scripts/test.sh --coverage

test-e2e: ## Run end-to-end tests
	@$(MAKE) build
	@CMUX_E2E_LOAD_DIST=1 CMUX_E2E_SKIP_BUILD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bun x playwright test --project=electron

## Distribution
dist: build ## Build distributable packages
	@bun x electron-builder --publish never

dist-mac: build ## Build macOS distributable
	@bun x electron-builder --mac --publish never

dist-win: build ## Build Windows distributable
	@bun x electron-builder --win --publish never

dist-linux: build ## Build Linux distributable
	@bun x electron-builder --linux --publish never

## Documentation
docs: ## Serve documentation locally
	@./scripts/docs.sh

docs-build: ## Build documentation
	@./scripts/docs_build.sh

docs-watch: ## Watch and rebuild documentation
	@cd docs && mdbook watch

## Benchmarks
benchmark-terminal: ## Run Terminal-Bench with the cmux agent (use TB_DATASET/TB_ARGS to customize)
	@TB_DATASET=$${TB_DATASET:-terminal-bench-core==0.1.1}; \
	CONCURRENCY_FLAG=$${TB_CONCURRENCY:+--n-concurrent $$TB_CONCURRENCY}; \
	LIVESTREAM_FLAG=$${TB_LIVESTREAM:+--livestream}; \
	echo "Running Terminal-Bench with dataset $$TB_DATASET"; \
	uvx terminal-bench run \
		--dataset "$$TB_DATASET" \
		--agent-import-path benchmarks.terminal_bench.cmux_agent:CmuxAgent \
		$$CONCURRENCY_FLAG \
		$$LIVESTREAM_FLAG \
		$${TB_ARGS}

## Clean
clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	@rm -rf dist release build/icon.icns build/icon.png
	@echo "Done!"

# Parallel build optimization - these can run concurrently
.NOTPARALLEL: build-main  # TypeScript can handle its own parallelism

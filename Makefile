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

.PHONY: all build dev start clean help
.PHONY: build-renderer version build-icons
.PHONY: lint lint-fix fmt fmt-check fmt-shell fmt-nix fmt-nix-check fmt-shell-check typecheck static-check
.PHONY: test test-unit test-integration test-watch test-coverage test-e2e
.PHONY: dist dist-mac dist-win dist-linux
.PHONY: docs docs-build docs-watch
.PHONY: ensure-deps

# Prettier patterns for formatting
PRETTIER_PATTERNS := 'src/**/*.{ts,tsx,json}' 'tests/**/*.{ts,json}' 'docs/**/*.{md,mdx}' '*.{json,md}'
TS_SOURCES := $(shell find src -type f \( -name '*.ts' -o -name '*.tsx' \))

# Default target
all: build

# Ensure dependencies are installed
ensure-deps:
	@if [ ! -d "node_modules" ]; then \
		echo "node_modules not found, running bun install..."; \
		bun install; \
	fi

## Help
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

## Development
dev: ensure-deps build-main ## Start development server (Vite + TypeScript watcher)
	@bun x concurrently -k \
		"bun x concurrently \"bun x tsc -w -p tsconfig.main.json\" \"bun x tsc-alias -w -p tsconfig.main.json\"" \
		"vite"

start: build-main build-preload ## Build and start Electron app
	@bun x electron --remote-debugging-port=9222 .

## Build targets (can run in parallel)
build: ensure-deps src/version.ts build-renderer build-main build-preload build-icons ## Build all targets

build-main: ensure-deps dist/main.js ## Build main process

dist/main.js: src/version.ts tsconfig.main.json tsconfig.json $(TS_SOURCES)
	@echo "Building main process..."
	@NODE_ENV=production bun x tsc -p tsconfig.main.json
	@NODE_ENV=production bun x tsc-alias -p tsconfig.main.json

build-preload: ensure-deps dist/preload.js ## Build preload script

dist/preload.js: src/preload.ts $(TS_SOURCES)
	@echo "Building preload script..."
	@NODE_ENV=production bun build src/preload.ts \
		--format=cjs \
		--target=node \
		--external=electron \
		--sourcemap=inline \
		--outfile=dist/preload.js

build-renderer: ensure-deps src/version.ts ## Build renderer process
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

>>>>>>> 1cbd3eac (🤖 Add cmux logo)
## Quality checks (can run in parallel)
static-check: lint typecheck fmt-check ## Run all static checks

lint: ## Run linter and typecheck
	@./scripts/lint.sh

lint-fix: ## Run linter with --fix
	@./scripts/lint.sh --fix

fmt: ## Format code with Prettier
	@echo "Formatting TypeScript/JSON/Markdown files..."
	@bun x prettier --write $(PRETTIER_PATTERNS)

fmt-check: ## Check code formatting
	@./scripts/fmt.sh --check
	@./scripts/fmt.sh --nix-check

fmt-shell: ## Format shell scripts with shfmt
	@./scripts/fmt.sh --shell

fmt-nix: ## Format flake.nix with nix fmt
	@./scripts/fmt.sh --nix

fmt-nix-check: ## Check flake.nix formatting
	@./scripts/fmt.sh --nix-check

typecheck: src/version.ts ## Run TypeScript type checking
	@./scripts/typecheck.sh

## Testing
test-integration: ## Run all tests (unit + integration)
	@bun test src
	@TEST_INTEGRATION=1 bun x jest tests

test-unit: ## Run unit tests
	@bun test src

test: test-unit ## Alias for test-unit

test-watch: ## Run tests in watch mode
	@./scripts/test.sh --watch

test-coverage: ## Run tests with coverage
	@./scripts/test.sh --coverage

test-e2e: ## Run end-to-end tests
	@PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bun x playwright test --project=electron

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

## Clean
clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	@rm -rf dist release build/icon.icns build/icon.png
	@echo "Done!"

# Parallel build optimization - these can run concurrently
.NOTPARALLEL: build-main  # TypeScript can handle its own parallelism

fmt-shell-check: ## Check shell script formatting
	@if ! command -v shfmt &>/dev/null; then \
		echo "shfmt not found. Install with: brew install shfmt"; \
		exit 1; \
	fi
	@echo "Checking shell script formatting..."
	@shfmt -i 2 -ci -bn -d scripts

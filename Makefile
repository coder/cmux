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
.PHONY: build-main build-preload build-renderer
.PHONY: lint lint-fix fmt fmt-check fmt-shell typecheck static-check
.PHONY: test-integration test-watch test-coverage
.PHONY: dist dist-mac dist-win dist-linux
.PHONY: docs docs-build docs-watch

# Prettier patterns for formatting
PRETTIER_PATTERNS := 'src/**/*.{ts,tsx,json}' 'tests/**/*.{ts,json}' 'docs/**/*.{md,mdx}' '*.{json,md}'

# Default target
all: build

## Help
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

## Development
dev: build-main ## Start development server (Vite + TypeScript watcher)
	@bun x concurrently -k \
		"bun x concurrently \"tsc -w -p tsconfig.main.json\" \"tsc-alias -w -p tsconfig.main.json\"" \
		"vite"

start: build-main build-preload ## Build and start Electron app
	@electron .

## Build targets (can run in parallel)
build: dist/version.txt build-renderer build-main build-preload ## Build all targets

build-main: dist/version.txt ## Build main process
	@echo "Building main process..."
	@tsc -p tsconfig.main.json
	@tsc-alias -p tsconfig.main.json

build-preload: ## Build preload script
	@echo "Building preload script..."
	@bun build src/preload.ts \
		--format=cjs \
		--target=node \
		--external=electron \
		--sourcemap=inline \
		--outfile=dist/preload.js

build-renderer: dist/version.txt ## Build renderer process
	@echo "Building renderer..."
	@vite build

dist/version.txt: ## Generate version file
	@./scripts/generate-version.sh

## Quality checks (can run in parallel)
static-check: lint typecheck fmt-check ## Run all static checks

lint: ## Run linter and typecheck
	@./scripts/lint.sh

lint-fix: ## Run linter with --fix
	@./scripts/lint.sh --fix

fmt: ## Format code with Prettier
	@echo "Formatting TypeScript/JSON/Markdown files..."
	@prettier --write $(PRETTIER_PATTERNS)

fmt-check: ## Check code formatting
	@echo "Checking TypeScript/JSON/Markdown formatting..."
	@prettier --check $(PRETTIER_PATTERNS) 2>&1 | grep -v 'No files matching'

fmt-shell: ## Format shell scripts with shfmt
	@./scripts/fmt.sh --shell

typecheck: ## Run TypeScript type checking
	@./scripts/typecheck.sh

## Testing
test-integration: ## Run all tests (unit + integration)
	@bun test src
	@TEST_INTEGRATION=1 jest tests

test: ## Run unit tests
	@bun test src

test-watch: ## Run tests in watch mode
	@./scripts/test.sh --watch

test-coverage: ## Run tests with coverage
	@./scripts/test.sh --coverage

## Distribution
dist: build ## Build distributable packages
	@electron-builder --publish never

dist-mac: build ## Build macOS distributable
	@electron-builder --mac --publish never

dist-win: build ## Build Windows distributable
	@electron-builder --win --publish never

dist-linux: build ## Build Linux distributable
	@electron-builder --linux --publish never

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
	@rm -rf dist release
	@echo "Done!"

# Parallel build optimization - these can run concurrently
.NOTPARALLEL: build-main  # TypeScript can handle its own parallelism

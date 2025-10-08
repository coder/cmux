# Build System
# ============
# This Makefile orchestrates the cmux build process with automatic parallelism.
#
# Quick Start:
#   make help          - Show all available targets
#   make dev           - Start development server with hot reload
#   make build         - Build all targets (parallel when possible)
#   make lint          - Run linter + typecheck
#   make test          - Run tests
#
# Parallelism:
#   Make automatically detects CPU cores and runs independent tasks concurrently.
#   Override with: make -j4 build (use 4 jobs) or make -j1 build (serial)
#
# Backwards Compatibility:
#   All commands also work via `bun run` (e.g., `bun run dev` calls `make dev`)
#
# Adding New Targets:
#   Add `## Description` after the target to make it appear in `make help`

.PHONY: all build dev start clean help
.PHONY: build-main build-preload build-renderer
.PHONY: lint lint-fix fmt fmt-check fmt-shell typecheck
.PHONY: test test-unit test-integration test-watch test-coverage
.PHONY: dist dist-mac dist-win dist-linux
.PHONY: docs docs-build docs-watch

# Detect number of cores for parallelism
MAKEFLAGS += --jobs=$(shell nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

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
lint: ## Run linter and typecheck
	@./scripts/lint.sh

lint-fix: ## Run linter with --fix
	@./scripts/lint.sh --fix

fmt: ## Format code with Prettier
	@./scripts/fmt.sh

fmt-check: ## Check code formatting
	@./scripts/fmt.sh --check

fmt-shell: ## Format shell scripts with shfmt
	@./scripts/fmt.sh --shell

typecheck: ## Run TypeScript type checking
	@./scripts/typecheck.sh

## Testing
test: test-unit ## Run unit tests
	@bun test src

test-unit: ## Run unit tests only
	@bun test src

test-integration: test-unit ## Run all tests (unit + integration)
	@TEST_INTEGRATION=1 jest tests

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

## CI targets
ci-check: lint typecheck test-integration ## Run all CI checks

# Parallel build optimization - these can run concurrently
.NOTPARALLEL: build-main  # TypeScript can handle its own parallelism

# Formatting Rules
# ================
# This file contains all code formatting logic.
# Included by the main Makefile.

.PHONY: fmt fmt-check fmt-prettier fmt-prettier-check fmt-shell fmt-shell-check fmt-nix fmt-nix-check fmt-python fmt-python-check

# Centralized patterns - single source of truth
PRETTIER_PATTERNS := 'src/**/*.{ts,tsx,json}' 'tests/**/*.ts' 'docs/**/*.md' 'package.json' 'tsconfig*.json' 'README.md'
SHELL_SCRIPTS := scripts
PYTHON_DIRS := benchmarks

# Always use bun x prettier for reproducibility (uses package.json version)
PRETTIER := bun x prettier

# Tool availability checks
SHFMT := $(shell command -v shfmt 2>/dev/null)
NIX := $(shell command -v nix 2>/dev/null)
UVX := $(shell command -v uvx 2>/dev/null || (test -x $(HOME)/.local/bin/uvx && echo $(HOME)/.local/bin/uvx))

fmt: fmt-prettier fmt-shell fmt-python fmt-nix
	@echo "==> All formatting complete!"

fmt-check: fmt-prettier-check fmt-shell-check fmt-python-check fmt-nix-check
	@echo "==> All formatting checks passed!"

fmt-prettier:
	@echo "Formatting TypeScript/JSON/Markdown files..."
	@$(PRETTIER) --write $(PRETTIER_PATTERNS)

fmt-prettier-check:
	@echo "Checking TypeScript/JSON/Markdown formatting..."
	@$(PRETTIER) --check $(PRETTIER_PATTERNS)

fmt-shell:
ifeq ($(SHFMT),)
	@echo "shfmt not found; skipping shell script formatting"
else
	@echo "Formatting shell scripts..."
	@shfmt -i 2 -ci -bn -w $(SHELL_SCRIPTS)
endif

fmt-shell-check:
ifeq ($(SHFMT),)
	@echo "shfmt not found; skipping shell script format check"
else
	@echo "Checking shell script formatting..."
	@shfmt -i 2 -ci -bn -d $(SHELL_SCRIPTS)
endif

fmt-python:
ifeq ($(UVX),)
	@echo "uvx not found; skipping Python formatting"
else
	@echo "Formatting Python files..."
	@$(UVX) ruff format $(PYTHON_DIRS)
endif

fmt-python-check:
ifeq ($(UVX),)
	@echo "uvx not found; skipping Python format check"
else
	@echo "Checking Python formatting..."
	@$(UVX) ruff format --check $(PYTHON_DIRS)
endif

fmt-nix:
ifeq ($(NIX),)
	@echo "Nix not found; skipping Nix formatting"
else ifeq ($(wildcard flake.nix),)
	@echo "flake.nix not found; skipping Nix formatting"
else
	@echo "Formatting Nix flake..."
	@nix fmt -- flake.nix
endif

fmt-nix-check:
ifeq ($(NIX),)
	@echo "Nix not found; skipping Nix format check"
else ifeq ($(wildcard flake.nix),)
	@echo "flake.nix not found; skipping Nix format check"
else
	@echo "Checking flake.nix formatting..."
	@tmp_dir=$$(mktemp -d "$${TMPDIR:-/tmp}/fmt-nix-check.XXXXXX"); \
	trap "rm -rf $$tmp_dir" EXIT; \
	cp flake.nix "$$tmp_dir/flake.nix"; \
	(cd "$$tmp_dir" && nix fmt -- flake.nix >/dev/null 2>&1); \
	if ! cmp -s flake.nix "$$tmp_dir/flake.nix"; then \
		echo "flake.nix is not formatted correctly. Run 'make fmt-nix' to fix."; \
		diff -u flake.nix "$$tmp_dir/flake.nix" || true; \
		exit 1; \
	fi
endif

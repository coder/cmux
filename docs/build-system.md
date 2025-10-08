# Build System

This project uses **Make** as the primary build orchestrator, with `package.json` scripts maintained for backwards compatibility.

## Quick Start

```bash
# Show all available targets
make help

# Development workflow
make dev          # Start dev server with hot reload
make start        # Build and run Electron app

# Build
make build        # Build all targets (with parallelism)
make clean        # Clean build artifacts

# Quality checks
make lint         # Run ESLint + typecheck
make fmt          # Format code with Prettier
make typecheck    # Run TypeScript type checking

# Testing
make test         # Run unit tests
make test-integration  # Run all tests (unit + integration)

# Distribution
make dist         # Build distributable packages
make dist-mac     # Build macOS distributable only
```

## Why Make?

### Performance through Parallelism

Make automatically detects CPU cores and runs independent tasks in parallel:

```bash
# These run concurrently when possible:
make build
  ├─ dist/version.txt (runs first)
  ├─ build-renderer  ┐
  ├─ build-main      ├─ Run in parallel
  └─ build-preload   ┘
```

This can significantly reduce build times on multi-core systems.

### Dependency Tracking

Make tracks file dependencies and only rebuilds what's changed:

```makefile
build-main: dist/version.txt  # Only rebuilds if version.txt changes
	tsc -p tsconfig.main.json
```

### Simplified Scripts

Rather than managing complex shell commands in `package.json`, we can use Make's native features:

- **Phony targets**: Targets that always run (like `clean`)
- **Prerequisites**: Automatic dependency ordering
- **Pattern rules**: Reusable build patterns
- **Variables**: Centralized configuration

## Architecture

```
package.json (backwards compat)
    │
    ├─> make dev       ──┐
    ├─> make build     ──┤
    └─> make test      ──┤
                         │
                    Makefile (orchestrator)
                         │
                         ├─> scripts/lint.sh
                         ├─> scripts/fmt.sh
                         ├─> tsc, vite, bun
                         └─> jest, eslint
```

## Backwards Compatibility

All existing `bun run` commands still work:

```bash
bun run dev          # Calls make dev
bun run build        # Calls make build
bun run typecheck    # Calls make typecheck
```

This ensures CI/CD pipelines and developer muscle memory continue to work.

## Adding New Targets

To add a new build target:

1. Add the target to `Makefile`:

   ```makefile
   my-target: dependency1 dependency2 ## Description for help
   	@echo "Running my target..."
   	@./scripts/my-script.sh
   ```

2. (Optional) Add to `package.json` for backwards compatibility:

   ```json
   {
     "scripts": {
       "my-target": "make my-target"
     }
   }
   ```

3. The `## Description` comment makes it appear in `make help`

## Parallelism Control

Make automatically uses all CPU cores. To control parallelism:

```bash
# Use specific number of jobs
make -j4 build

# Disable parallelism
make -j1 build
```

For targets that shouldn't run in parallel (e.g., TypeScript which manages its own parallelism):

```makefile
.NOTPARALLEL: build-main
```

## Tips

- **See what Make will do**: `make -n build` (dry run)
- **Debug Make**: `make -d build` (verbose debug output)
- **Force rebuild**: `make -B build` (ignore timestamps)
- **Keep going on errors**: `make -k build` (continue despite failures)

## CI Integration

The `ci-check` target runs all CI checks:

```bash
make ci-check
# Equivalent to:
#   make lint && make typecheck && make test-integration
```

Update your CI configuration to use this single target for consistent checks across environments.

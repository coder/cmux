# Developer Guide

## Documentation Guidelines

**Developer documentation should live inline with relevant code as comments.**

Instead of creating separate documentation files for technical details, embed documentation directly in the code:

- **Makefiles**: Add header comments explaining purpose, usage, and key concepts
- **Scripts**: Include comments explaining behavior, arguments, and examples
- **Configuration files**: Document options and their effects inline
- **Source code**: Use JSDoc/TSDoc for APIs, inline comments for complex logic

### Benefits

- **Single source of truth**: Documentation stays synchronized with code
- **Easier maintenance**: Changes to code prompt documentation updates in the same diff
- **Better discoverability**: Developers find docs where they're working
- **Less context switching**: No need to navigate to separate doc files

### When to Create Separate Docs

Use separate documentation files (in `docs/`) for:

- **User-facing guides**: Installation, usage, tutorials
- **Architecture overviews**: High-level system design
- **Project context**: Project goals, conventions, onboarding

### Example: Makefile Documentation

Instead of creating `docs/build-system.md`, we document the build system at the top of `Makefile`:

```makefile
# Build System
# ============
# This Makefile orchestrates the cmux build process with automatic parallelism.
#
# Quick Start:
#   make help    - Show all available targets
#   make build   - Build all targets (parallel when possible)
#
# Parallelism:
#   Make automatically detects CPU cores and runs independent tasks concurrently.
```

This keeps build documentation where developers naturally look when modifying the build.

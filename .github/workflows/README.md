# GitHub Actions Workflows

## Overview

This directory contains CI/CD workflows for cmux:

- **ci.yml** - Runs on PRs and merge queue (lint, typecheck, tests)
- **build.yml** - Builds distributables on PRs (verification only, no publishing)
- **release.yml** - Builds and publishes distributables when a release is published
- **docs.yml** - Builds and deploys documentation

## Release Process

### Human Steps

1. **Bump version** in `package.json` (e.g., `0.0.1` → `0.1.0`)
2. **Commit and push** the version change to main
3. **Create a draft release** on GitHub:
   - Go to Releases → Draft a new release
   - Create a new tag (e.g., `v0.1.0`)
   - Write release notes
4. **Publish the draft release**
   - This triggers the `release.yml` workflow
5. **Wait for builds** (~10-15 minutes)
   - macOS builds (x64 + arm64 DMGs)
   - Linux builds (AppImage)
   - Binaries are automatically attached to the release

### How It Works

The release workflow is triggered when you publish a release (not when you create a draft). electron-builder detects the `GH_TOKEN` environment variable and automatically uploads built artifacts to the GitHub release.

## Keeping Workflows in Sync

The `build.yml` and `release.yml` workflows share similar setup steps (install dependencies, build application, code signing). When making changes to build configuration:

1. **Update both workflows** if changing:
   - Dependency installation steps
   - Build process
   - Code signing setup
   - Platform-specific configuration

2. **Key differences**:
   - `build.yml` uses `--publish never` (via `make dist-*`)
   - `release.yml` uses `--publish always` and requires `GH_TOKEN`
   - `build.yml` uploads artifacts for PR review
   - `release.yml` attaches artifacts directly to GitHub releases

## Windows Support

Windows builds are not currently included in release automation. To add Windows support:

1. Add a `build-windows` job to `release.yml` (see `build.yml` for structure)
2. Add Windows code signing certificate secrets
3. Test the NSIS installer configuration in `package.json`

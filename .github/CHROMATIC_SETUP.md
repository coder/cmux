# Chromatic Visual Regression Testing

This repository uses Chromatic for automated visual regression testing of Storybook components.

## Setup Complete ✅

The following has been configured:

- ✅ Chromatic CLI installed (`chromatic@13.3.0`)
- ✅ GitHub Actions workflow (`.github/workflows/chromatic.yml`)
- ✅ Configuration file (`chromatic.config.json`)
- ✅ Project token added to GitHub Secrets
- ✅ Documentation updated

## How It Works

### On Pull Requests
1. Chromatic captures snapshots of all Storybook stories
2. Compares snapshots to the baseline from `main`
3. Posts visual diffs as PR comments
4. Build passes (won't block merge even with visual changes)
5. Developers review changes in Chromatic UI

### On Main Branch
- Changes are automatically accepted as the new baseline
- All future PRs compare against this baseline

## TurboSnap Optimization

**TurboSnap** is enabled to speed up builds:
- Only captures snapshots for changed stories
- Typical build time: ~30 seconds
- Requires full git history (`fetch-depth: 0`)

## Commands

```bash
# Run Chromatic locally (requires CHROMATIC_PROJECT_TOKEN env var)
bun run chromatic

# Build Storybook
bun run build-storybook

# Run Storybook dev server
bun run storybook
```

## Configuration Files

- `.github/workflows/chromatic.yml` - CI workflow
- `chromatic.config.json` - Chromatic settings
- `STORYBOOK.md` - Full Storybook documentation

## Accessing Chromatic

Visit https://www.chromatic.com/ and log in with your GitHub account to:
- View detailed visual diffs
- Approve/reject changes
- See build history
- Manage baselines

## Complements E2E Tests

Chromatic works alongside your existing e2e tests:
- **Chromatic**: Tests visual appearance of isolated components
- **E2E tests**: Test behavior and user interactions
- **No overlap**: Different concerns with minimal maintenance burden

## Free for Open Source

This project qualifies for Chromatic's free open source plan with unlimited builds.


# 🎨 Chromatic Setup Guide

This guide explains how to set up and use Chromatic for visual regression testing in cmux.

## What is Chromatic?

Chromatic is a visual testing platform that:
- Captures screenshots of your Storybook components
- Detects visual changes between commits
- Provides a UI review workflow for accepting/rejecting changes
- Integrates with GitHub PRs to show visual diffs

## Initial Setup

### 1. Create a Chromatic Account

1. Go to [chromatic.com](https://www.chromatic.com/)
2. Sign in with your GitHub account
3. Click "Add project" and select the `coder/cmux` repository

### 2. Get Your Project Token

After creating the project, you'll receive a project token that looks like:
```
chpt_1234567890abcdef
```

### 3. Configure GitHub Secrets

Add the Chromatic project token to your GitHub repository:

1. Go to repository **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `CHROMATIC_PROJECT_TOKEN`
4. Value: Your Chromatic project token from step 2
5. Click **Add secret**

### 4. Update Configuration File

Edit `chromatic.config.json` and replace the placeholder with your actual project ID:

```json
{
  "projectId": "your-actual-project-id-here"
}
```

You can find your project ID in the Chromatic dashboard URL or in the setup instructions.

## Usage

### Running Chromatic Locally

Test your Storybook components with Chromatic before pushing:

```bash
# Set your project token (one-time setup)
export CHROMATIC_PROJECT_TOKEN=chpt_your_token_here

# Run Chromatic
make chromatic
# or
bun run chromatic
```

### Automated PR Checks

Chromatic automatically runs on every pull request via GitHub Actions. The workflow:

1. Builds your Storybook
2. Captures screenshots of all stories
3. Compares them against the baseline (main branch)
4. Posts a status check and comment on your PR with:
   - Number of visual changes detected
   - Link to review changes in Chromatic UI
   - Direct comparison images

### Reviewing Changes

When Chromatic detects visual changes:

1. Click the **"View changes in Chromatic"** link in the PR
2. Review each component change in the Chromatic UI
3. Accept or reject changes:
   - ✅ **Accept**: Updates the baseline for future comparisons
   - ❌ **Reject**: Keeps the existing baseline (treat as a regression)

### Workflow Integration

The Chromatic check is **informational** (won't block PRs) thanks to `exitZeroOnChanges: true`. This allows you to:
- Review visual changes at your own pace
- Merge PRs even with pending visual reviews
- Accept/reject changes after merging if needed

To make it a **required check** (block PRs with unreviewed changes):
1. Update `.github/workflows/chromatic.yml`: Remove `exitZeroOnChanges: true`
2. Add Chromatic as a required status check in GitHub branch protection

## Best Practices

### Component Development

1. **Create stories for visual states**: Add Storybook stories for each significant visual state
2. **Keep stories focused**: Each story should demonstrate one specific state or variant
3. **Use controls**: Make stories interactive with Storybook controls for easier testing

### Managing Changes

1. **Accept intentional changes**: When you update styling, accept the Chromatic changes
2. **Investigate unexpected changes**: If Chromatic catches changes you didn't make, investigate before accepting
3. **Batch reviews**: Review multiple small changes together rather than one at a time

### Performance

- Chromatic uses **smart diffing** - only changed stories are captured
- The workflow uses `onlyChanged: true` to speed up builds
- First run takes longer (captures all baselines)
- Subsequent runs are much faster

## Troubleshooting

### "Project token not found" Error

Make sure you've added `CHROMATIC_PROJECT_TOKEN` to GitHub Secrets and it matches your Chromatic project token exactly.

### Workflow Fails to Build Storybook

Check that:
1. `make storybook-build` works locally
2. All dependencies are installed
3. No TypeScript errors in story files

### Visual Differences in Fonts/Colors

This can happen due to OS-level rendering differences. Chromatic uses consistent rendering, but local previews might look different. Trust the Chromatic UI for accurate comparisons.

### Too Many Changes Detected

If you've refactored significantly:
1. Review and accept legitimate changes in batches
2. Consider using Chromatic's "Accept all" feature for major style updates
3. Use Chromatic's branch comparison to see changes against your feature branch

## Configuration Reference

### chromatic.config.json

```json
{
  "projectId": "your-project-id",
  "buildScriptName": "storybook:build",  // npm script to build Storybook
  "storybookBuildDir": "storybook-static", // Where Storybook builds to
  "exitZeroOnChanges": true,              // Don't fail on visual changes
  "exitOnceUploaded": true,               // Exit after upload completes
  "autoAcceptChanges": false              // Don't auto-accept changes
}
```

### Workflow Options

In `.github/workflows/chromatic.yml`:

- `onlyChanged: true` - Only test changed stories (faster)
- `exitZeroOnChanges: true` - Don't block PRs on visual changes
- `buildScriptName` - The npm/make script that builds Storybook

## Resources

- [Chromatic Documentation](https://www.chromatic.com/docs/)
- [Storybook Documentation](https://storybook.js.org/docs)
- [Visual Testing Best Practices](https://www.chromatic.com/docs/test)


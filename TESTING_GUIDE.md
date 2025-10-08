# Testing Guide: GitHub PR Link Feature

## Prerequisites

1. **GitHub CLI installed**:
   ```bash
   # Check if gh is installed
   gh --version
   
   # If not, install it:
   # macOS: brew install gh
   # Linux: See https://github.com/cli/cli#installation
   ```

2. **GitHub CLI authenticated**:
   ```bash
   gh auth status
   
   # If not authenticated:
   gh auth login
   ```

3. **Repository with open PR**:
   - Clone a GitHub repository
   - Create a branch with an associated open PR
   - Or use an existing workspace with an open PR

## Testing Steps

### Test 1: PR Detection (Positive Case)

1. **Start the app**:
   ```bash
   bun dev
   # In another terminal:
   bun start
   ```

2. **Create/Select a workspace** with an open PR:
   - The workspace must be on a branch that has an open PR
   
3. **Verify GitHub icon appears**:
   - Look in the workspace sidebar
   - A GitHub logo should appear next to the workspace name (after the git status indicator)
   
4. **Hover over the icon**:
   - Tooltip should show: "PR #[number]: [title]"
   
5. **Click the icon**:
   - Your default browser should open to the PR URL

### Test 2: No PR (Negative Case)

1. **Create a workspace** on a branch without a PR:
   - No GitHub icon should appear
   
2. **Switch to a branch without PR**:
   - GitHub icon should disappear after ~1 second

### Test 3: Closed PR

1. **Close the PR** on GitHub
2. **Wait ~1 second** for polling
3. **Verify icon disappears** (only OPEN PRs are shown)

### Test 4: No GitHub CLI

1. **Rename `gh` temporarily**:
   ```bash
   # Find gh location
   which gh
   # Example: /opt/homebrew/bin/gh
   
   # Temporarily rename
   sudo mv /opt/homebrew/bin/gh /opt/homebrew/bin/gh.bak
   ```

2. **Restart the app**
3. **Verify no errors** and icon simply doesn't appear
4. **Restore gh**:
   ```bash
   sudo mv /opt/homebrew/bin/gh.bak /opt/homebrew/bin/gh
   ```

### Test 5: Multiple Workspaces

1. **Create multiple workspaces**:
   - Some with PRs
   - Some without PRs
   
2. **Verify icons appear only** for workspaces with open PRs

### Test 6: Performance

1. **Monitor console** for errors
2. **Check debug logs**:
   ```bash
   # In the app, open DevTools (Cmd+Option+I)
   # Look for "GitHub CLI" or "PR" related messages
   ```
3. **Verify smooth UI** - no lag or stuttering

## Expected Behavior

✅ **Should show icon when**:
- GitHub CLI is installed and authenticated
- Workspace branch has an open PR
- PR state is "OPEN"

❌ **Should NOT show icon when**:
- GitHub CLI is not installed
- Branch has no PR
- PR is closed or merged
- GitHub CLI is not authenticated (no errors, just no icon)

## Debugging

If the icon doesn't appear when expected:

1. **Check GitHub CLI manually**:
   ```bash
   cd /path/to/workspace
   gh pr view --json number,title,url,state
   ```

2. **Check app logs**:
   - Open DevTools in the app
   - Look for debug messages about PR detection

3. **Verify workspace path**:
   - Ensure the workspace is in the correct directory
   - Check that it's actually a git repository

4. **Test PR state**:
   ```bash
   gh pr status
   ```

## Notes

- PR detection polls every 1 second
- Only OPEN PRs are shown (closed/merged PRs are filtered out)
- Network errors are handled gracefully (just won't show icon)
- GitHub CLI rate limits shouldn't be an issue for normal usage

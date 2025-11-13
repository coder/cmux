# VS Code Marketplace Release Plan

This document outlines the process for publishing the cmux VS Code extension to the official VS Code Marketplace.

## Prerequisites

### 1. Azure DevOps Account & Publisher Setup

**Required for marketplace publishing:**

1. **Azure DevOps Account**: Create or use existing account at https://dev.azure.com
2. **Personal Access Token (PAT)**:
   - Navigate to: User Settings → Personal Access Tokens → New Token
   - Scopes required:
     - **Marketplace: Acquire** (read extensions)
     - **Marketplace: Publish** (publish/update extensions)
   - Expiration: Set to longest available (1 year), add calendar reminder to rotate
   - Store securely (1Password, GitHub Secrets, etc.)

3. **Publisher Verification**:
   ```bash
   npx @vscode/vsce login coder
   # Enter PAT when prompted
   ```
   
   If "coder" publisher doesn't exist, create it:
   ```bash
   npx @vscode/vsce create-publisher coder
   # Follow prompts for publisher details
   ```

4. **GitHub Secrets Setup**:
   - Add PAT to repository secrets as `VSCE_PAT`
   - Navigate to: Repository Settings → Secrets and variables → Actions → New repository secret

### 2. Local Tools Installation

```bash
cd vscode
bun install  # Installs @vscode/vsce as devDependency
```

Or install globally:
```bash
npm install -g @vscode/vsce
```

## Pre-Release Checklist

Before publishing to the marketplace, verify:

- [ ] **Version number**: Update `vscode/package.json` version field
- [ ] **CHANGELOG.md**: Document all changes for this release
- [ ] **README.md**: Ensure installation instructions are accurate
- [ ] **Icon**: Verify `icon.png` exists and meets requirements (128x128 minimum)
- [ ] **License**: Confirm LICENSE file is present
- [ ] **Repository URL**: Verify `package.json` repository field is correct
- [ ] **Keywords**: Review `package.json` keywords for discoverability
- [ ] **Categories**: Confirm `package.json` categories are appropriate
- [ ] **Extension tests**: Run local testing
  ```bash
  cd vscode
  bun run compile
  bun run package  # Creates .vsix
  code --install-extension cmux-<version>.vsix
  # Test: Cmd+Shift+P → "cmux: Open Workspace"
  ```
- [ ] **Main cmux app compatibility**: Test with latest cmux desktop app
- [ ] **SSH remote testing**: Verify SSH workspace detection with Remote-SSH
- [ ] **Error handling**: Test with missing config, invalid workspaces, etc.

## Publishing Process

### Manual Publishing (One-Time or Emergency)

```bash
cd vscode

# 1. Update version (major|minor|patch)
npm version patch  # Or: minor, major

# 2. Build extension
bun run compile

# 3. Package extension
bun run package
# Creates: cmux-<version>.vsix

# 4. Publish to marketplace
npx @vscode/vsce publish
# Or with explicit PAT:
npx @vscode/vsce publish -p <PAT>

# 5. Create GitHub release
git tag vscode-v<version>
git push origin vscode-v<version>
gh release create vscode-v<version> \
  --title "🤖 VS Code Extension v<version>" \
  --notes "See CHANGELOG.md for details" \
  vscode/cmux-<version>.vsix
```

### Automated Publishing via GitHub Actions

**Workflow file**: `.github/workflows/publish-vscode-extension.yml`

**Trigger**: Push tag matching `vscode-v*`

**Process**:
1. Checkout code
2. Install dependencies (`bun install`)
3. Compile extension (`bun run compile`)
4. Package extension (`bun run package`)
5. Publish to VS Code Marketplace using `VSCE_PAT` secret
6. Create GitHub release with `.vsix` attached

**To trigger automated release**:
```bash
cd vscode
npm version patch  # Updates package.json version
git add package.json
git commit -m "🤖 release: VS Code extension v0.1.1"
git push origin marketplace-release
git tag vscode-v0.1.1
git push origin vscode-v0.1.1
```

## Post-Release Verification

After publishing:

1. **Marketplace Listing**: Visit https://marketplace.visualstudio.com/items?itemName=coder.cmux
2. **Installation Test**:
   ```bash
   code --uninstall-extension coder.cmux
   code --install-extension coder.cmux
   ```
3. **Update Check**: VS Code Extensions panel should show latest version
4. **Metrics**: Monitor install count and ratings on marketplace page

## Version Strategy

- **0.1.x**: Initial releases, stability improvements
- **0.2.x**: Feature additions (e.g., workspace filtering, quick pick improvements)
- **1.0.0**: Stable release after user feedback and polish

**Breaking changes**: Follow semver (major version bump)

## Troubleshooting

### Common Issues

**"Publisher 'coder' not found"**
- Solution: Run `npx @vscode/vsce create-publisher coder`

**"Authentication failed"**
- Solution: PAT may be expired or have insufficient scopes
- Regenerate PAT with Marketplace: Acquire + Publish scopes

**"Extension validation failed"**
- Check `package.json` required fields (name, version, publisher, engines)
- Ensure icon.png exists and is valid
- Run `npx @vscode/vsce ls` to preview packaged files

**"Version already exists"**
- Cannot republish same version
- Increment version: `npm version patch`

## Rollback Procedure

If a release has critical issues:

1. **Unpublish version** (within 24 hours only):
   ```bash
   npx @vscode/vsce unpublish coder.cmux@<version>
   ```
   ⚠️ After 24 hours, cannot unpublish (Microsoft restriction)

2. **Publish fixed version**:
   ```bash
   npm version patch  # Increment to next version
   bun run compile
   npx @vscode/vsce publish
   ```

3. **Notify users**: Update GitHub release notes with errata

## Maintenance

### PAT Rotation

Azure DevOps PATs expire after 1 year (maximum). Before expiration:

1. Generate new PAT with same scopes
2. Update `VSCE_PAT` GitHub secret
3. Test publishing with new token
4. Revoke old PAT after verification

### Monitoring

- **Install metrics**: Check marketplace page weekly
- **Issues**: Monitor GitHub issues with `vscode-extension` label
- **User feedback**: Respond to marketplace reviews

## Resources

- **VS Code Publishing Guide**: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- **vsce CLI Docs**: https://github.com/microsoft/vscode-vsce
- **Marketplace Management**: https://marketplace.visualstudio.com/manage/publishers/coder
- **Azure DevOps PAT**: https://dev.azure.com/_usersSettings/tokens

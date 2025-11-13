# VS Code Extension Release Checklist

Quick reference for releasing a new version of the cmux VS Code extension.

## One-Time Setup (Done Once)

- [ ] Create Azure DevOps account at https://dev.azure.com
- [ ] Generate PAT with Marketplace: Acquire + Publish scopes
- [ ] Add `VSCE_PAT` to GitHub repository secrets
- [ ] Verify/create "coder" publisher: `npx @vscode/vsce login coder`

## Pre-Release (Every Release)

- [ ] Update version in `vscode/package.json`
- [ ] Update `vscode/CHANGELOG.md` with changes
- [ ] Test extension locally:
  ```bash
  cd vscode
  bun run compile
  bun run package
  code --install-extension cmux-<version>.vsix
  # Test: Cmd+Shift+P → "cmux: Open Workspace"
  ```
- [ ] Test with local workspaces
- [ ] Test with SSH workspaces (if applicable)
- [ ] Verify error handling (missing config, etc.)

## Release (Automated via GitHub Actions)

```bash
cd vscode

# 1. Commit version bump
git add package.json CHANGELOG.md
git commit -m "🤖 release: VS Code extension v0.1.1"

# 2. Push to branch
git push origin marketplace-release

# 3. Create and push tag
git tag vscode-v0.1.1
git push origin vscode-v0.1.1
```

GitHub Actions will automatically:
- Build and package the extension
- Publish to VS Code Marketplace
- Create GitHub release with .vsix file

## Post-Release Verification

- [ ] Check GitHub Actions workflow completed successfully
- [ ] Visit marketplace: https://marketplace.visualstudio.com/items?itemName=coder.cmux
- [ ] Test installation from marketplace:
  ```bash
  code --uninstall-extension coder.cmux
  code --install-extension coder.cmux
  ```
- [ ] Verify version in VS Code Extensions panel
- [ ] Check GitHub release page has .vsix attached

## Manual Release (Emergency/Fallback)

If GitHub Actions fails:

```bash
cd vscode
bun run compile
bun run package
npx @vscode/vsce publish -p <PAT>

# Create GitHub release manually
gh release create vscode-v<version> \
  --title "🤖 VS Code Extension v<version>" \
  --notes "See CHANGELOG.md" \
  vscode/cmux-<version>.vsix
```

## Troubleshooting

**GitHub Actions fails on publish step:**
- Check `VSCE_PAT` secret is set and valid
- Verify PAT has correct scopes
- Check if version already exists on marketplace

**"Version already exists" error:**
- Increment version and try again
- Cannot republish same version to marketplace

**Extension not appearing in marketplace:**
- Allow 5-10 minutes for indexing
- Check marketplace management portal for status

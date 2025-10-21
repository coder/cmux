# Storybook Screenshot Tool Demo

This PR adds a tool to automatically screenshot all your Storybook stories!

## Quick Demo

```bash
# Run the screenshot tool
make screenshot-storybook
```

This will:
1. ✅ Start Storybook automatically (if not already running)
2. ✅ Launch a headless browser
3. ✅ Visit each story in your Storybook
4. ✅ Take a screenshot
5. ✅ Generate a manifest with metadata
6. ✅ Clean up and shut down

## What You Get

### Screenshots

Every story gets its own PNG file:

```
artifacts/storybook-screenshots/
├── components-commandpalette--default.png
├── components-commandpalette--with-results.png
├── components-modal--default.png
├── components-modal--with-actions.png
├── components-modalselector--default.png
├── components-newworkspacemodal--default.png
├── components-thinkingslider--default.png
├── components-togglegroup--default.png
├── messages-historyHiddenmessage--default.png
├── messages-streamerrormessage--default.png
├── messages-terminaloutput--default.png
├── messages-terminaloutput--with-error.png
├── messages-terminaloutput--with-success.png
├── messages-usermessage--default.png
└── manifest.json
```

### Manifest

A JSON file with all the metadata:

```json
{
  "timestamp": "2025-10-21T16:30:00.000Z",
  "viewport": { "width": 1280, "height": 720 },
  "storybookUrl": "http://localhost:6006",
  "screenshots": [
    {
      "id": "components-modal--default",
      "title": "Components/Modal",
      "name": "Default",
      "filename": "components-modal--default.png",
      "url": "http://localhost:6006/iframe.html?id=components-modal--default&viewMode=story"
    },
    ...
  ]
}
```

## Real-World Use Cases

### 1. Visual PR Reviews

Share screenshots when making UI changes:

```bash
make screenshot-storybook
# Drag-and-drop images into GitHub PR comment
```

Before/after comparisons help reviewers understand visual changes at a glance.

### 2. Component Documentation

Commit screenshots to automatically document your component library:

```bash
make screenshot-storybook
git add artifacts/storybook-screenshots/
git commit -m "📸 Update component screenshots"
```

### 3. Visual Regression Testing

Foundation for automated visual testing:

```bash
# Take baseline screenshots
make screenshot-storybook
mv artifacts/storybook-screenshots artifacts/baseline

# After changes, compare
make screenshot-storybook
# Run visual diff tool
```

### 4. Design System Audit

Quickly see all components in one place:

```bash
make screenshot-storybook
open artifacts/storybook-screenshots/
```

Perfect for design reviews and maintaining consistency.

## Configuration

The tool is highly configurable. See `scripts/README-screenshot-storybook.md` for:

- Custom viewports (mobile, tablet, desktop)
- Theme switching (light/dark mode)
- Filtering specific stories
- CI/CD integration
- External hosting options

## Technical Details

**Stack:**
- Playwright for browser automation
- Storybook's internal API to enumerate stories
- Automatic process management (starts/stops Storybook)
- Robust error handling and cleanup

**Performance:**
- Headless browser for speed
- Efficient story enumeration
- Configurable timeouts
- Graceful cleanup on failure

## Next Steps

After merging, teams can:

1. **Integrate into CI**: Auto-screenshot on PR creation
2. **Visual regression**: Compare against baselines
3. **Deploy to GitHub Pages**: Showcase component library
4. **Design reviews**: Share with design team
5. **Documentation**: Embed in docs site

## Try It Locally

```bash
# Checkout this branch
git fetch origin
git checkout storybook-screenshots

# Install dependencies (if needed)
bun install

# Run the tool!
make screenshot-storybook

# View the results
open artifacts/storybook-screenshots/
```

## Files Changed

- `scripts/screenshot-storybook.ts` - Main script (340 lines)
- `scripts/README-screenshot-storybook.md` - Documentation (243 lines)
- `Makefile` - Added `screenshot-storybook` target
- `package.json` - Added `@octokit/rest` dependency

## Questions?

See the full documentation in `scripts/README-screenshot-storybook.md` for:
- Detailed usage examples
- Troubleshooting guide
- Advanced configurations
- CI integration examples


# Storybook Screenshot Tool

Automatically capture screenshots of all Storybook stories for visual documentation and PR reviews.

## Features

- 📸 Screenshots all Storybook stories automatically
- 🔄 Starts Storybook server automatically (or uses existing instance)
- 📊 Generates a JSON manifest with metadata
- 🎨 Organized output by component
- 🔗 Includes links to Storybook URLs
- 📤 GitHub integration helpers

## Quick Start

```bash
# Screenshot all stories
make screenshot-storybook

# Or run directly
bun scripts/screenshot-storybook.ts
```

Screenshots are saved to `artifacts/storybook-screenshots/`

## Output Structure

```
artifacts/storybook-screenshots/
├── manifest.json                          # Metadata about all screenshots
├── components-modal--default.png          # Screenshot files
├── components-modal--with-actions.png
└── ...
```

### Manifest Format

```json
{
  "timestamp": "2025-10-21T12:00:00.000Z",
  "viewport": { "width": 1280, "height": 720 },
  "storybookUrl": "http://localhost:6006",
  "screenshots": [
    {
      "id": "components-modal--default",
      "title": "Components/Modal",
      "name": "Default",
      "filename": "components-modal--default.png",
      "url": "http://localhost:6006/iframe.html?id=components-modal--default&viewMode=story"
    }
  ]
}
```

## Usage with GitHub

### Option 1: Commit Screenshots to Repo

The simplest approach for small teams:

```bash
# Take screenshots
make screenshot-storybook

# Commit them
git add artifacts/storybook-screenshots/
git commit -m "📸 Add Storybook screenshots"
git push
```

Then reference them in PRs:

```markdown
## Visual Changes

### Modal Component
![Modal](./artifacts/storybook-screenshots/components-modal--default.png)
```

### Option 2: Manual Upload to PR

For one-off reviews:

1. Take screenshots: `make screenshot-storybook`
2. Open your PR on GitHub
3. Drag and drop images from `artifacts/storybook-screenshots/` into a comment
4. GitHub will automatically host and display them

### Option 3: External Image Hosting

For teams that don't want to commit images:

```bash
# Take screenshots
make screenshot-storybook

# Upload to your preferred service (imgur, cloudinary, etc.)
# Then post links in your PR
```

## Configuration

### Environment Variables

- `STORYBOOK_URL` - Custom Storybook URL (default: `http://localhost:6006`)
- `GITHUB_TOKEN` - For GitHub API integration (future feature)

### Custom Viewport

Edit `scripts/screenshot-storybook.ts`:

```typescript
const VIEWPORT = { width: 1920, height: 1080 };
```

## Advanced Usage

### Screenshot Specific Stories

Currently screenshots all stories. To filter specific stories, modify the `getStories()` function:

```typescript
const stories = await getStories(page);
const filtered = stories.filter(s => s.title.startsWith('Components/'));
```

### Different Viewports

To capture mobile and desktop views:

```typescript
const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'desktop', width: 1280, height: 720 },
];

for (const viewport of viewports) {
  await context.setViewportSize(viewport);
  // Take screenshot...
}
```

### Visual Regression Testing

Combine with a visual regression tool like [Percy](https://percy.io/) or [Chromatic](https://www.chromatic.com/):

```typescript
// In your CI pipeline
await screenshotAllStories();
// Upload to Percy/Chromatic
```

## CI Integration

Add to `.github/workflows/storybook-screenshots.yml`:

```yaml
name: Storybook Screenshots

on:
  pull_request:
    paths:
      - 'src/components/**/*.tsx'
      - 'src/components/**/*.stories.tsx'

jobs:
  screenshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: make screenshot-storybook
      - uses: actions/upload-artifact@v4
        with:
          name: storybook-screenshots
          path: artifacts/storybook-screenshots/
```

## Troubleshooting

### Storybook won't start

Make sure dependencies are installed:

```bash
bun install
```

### Screenshots are blank

Some stories may need more time to render. Increase the wait time in `waitForStorybook()`:

```typescript
await page.waitForTimeout(1000); // Increase from 500ms
```

### Port already in use

If port 6006 is in use:

```bash
STORYBOOK_URL=http://localhost:6007 make screenshot-storybook
```

Or kill the existing process:

```bash
lsof -ti:6006 | xargs kill
```

## Development

The script uses:
- **Playwright** - Browser automation
- **Storybook** - Component documentation
- **Bun** - Runtime and package manager

To modify the script:

1. Edit `scripts/screenshot-storybook.ts`
2. Test locally: `bun scripts/screenshot-storybook.ts`
3. Commit changes

## Future Enhancements

Potential improvements:

- [ ] Direct GitHub API upload (requires image hosting solution)
- [ ] Multiple viewport support
- [ ] Theme switching (light/dark mode)
- [ ] Parallel screenshot capture
- [ ] Visual diff with previous screenshots
- [ ] Integration with Percy/Chromatic
- [ ] Configurable wait times per story
- [ ] Screenshot only changed stories

## Related

- [Storybook Documentation](https://storybook.js.org/)
- [Playwright Documentation](https://playwright.dev/)
- [Visual Regression Testing Guide](https://storybook.js.org/docs/react/writing-tests/visual-testing)


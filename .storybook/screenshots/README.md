# Storybook Screenshots

This directory contains screenshots of Storybook components, useful for:

- 📸 **Visual references in PRs** - Show UI changes at a glance
- 📝 **Documentation** - Illustrate components without running Storybook
- 🐛 **Issue reports** - Demonstrate visual bugs clearly

## Generating Screenshots

Use the `screenshot-storybook.ts` script to automatically capture screenshots:

### Prerequisites

```bash
# Install Playwright browsers (one-time setup)
bun x playwright install chromium
```

### Usage Examples

```bash
# Screenshot all stories (requires Storybook running on localhost:6006)
make screenshot-storybook

# Screenshot a specific component
make screenshot-storybook COMPONENT=Modal

# Screenshot a specific story
make screenshot-storybook STORY=modal--basic

# Custom options
bun scripts/screenshot-storybook.ts --help
```

### Options

- `--story <name>` - Screenshot a specific story ID (e.g., "modal--basic")
- `--component <name>` - Screenshot all stories for a component (e.g., "Modal")
- `--output <dir>` - Output directory (default: `.storybook/screenshots`)
- `--width <px>` - Viewport width (default: 1280)
- `--height <px>` - Viewport height (default: 800)
- `--build` - Use built Storybook instead of dev server
- `--url <url>` - Custom Storybook URL (default: http://localhost:6006)

## Using in PRs

When making UI changes, generate screenshots and include them in your PR:

1. Start Storybook: `make storybook`
2. Generate screenshots: `make screenshot-storybook COMPONENT=YourComponent`
3. Commit the new screenshots
4. Reference them in your PR description:

```markdown
## UI Changes

### Before
![Old UI](.storybook/screenshots/component--old-story.png)

### After
![New UI](.storybook/screenshots/component--new-story.png)
```

## Naming Convention

Screenshots are named using the Storybook story ID format:

```
<component-name>--<story-name>.png
```

Examples:
- `modal--basic.png`
- `modal--with-subtitle.png`
- `components-messages-assistantmessage--default.png`

## NixOS Note

If you're developing on NixOS, you'll need to enter the Nix development shell first:

```bash
nix develop
make screenshot-storybook
```

The flake includes Playwright dependencies for screenshot generation.


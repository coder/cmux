# Storybook

This project uses [Storybook](https://storybook.js.org/) for component development and documentation.

## Running Storybook

To start Storybook in development mode:

```bash
bun run storybook
```

This will start Storybook on http://localhost:6006

## Building Storybook

To build a static version of Storybook:

```bash
bun run build-storybook
```

The output will be in the `storybook-static` directory.

## Creating Stories

Stories are located next to their components with the `.stories.tsx` extension.

Example structure:

```
src/components/Messages/
├── AssistantMessage.tsx
└── AssistantMessage.stories.tsx
```

### Example Story

```typescript
import type { Meta, StoryObj } from "@storybook/react";
import { MyComponent } from "./MyComponent";

const meta = {
  title: "Category/MyComponent",
  component: MyComponent,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    // component props
  },
};
```

## Current Stories

- **Messages/AssistantMessage**: Various states of assistant messages including streaming, partial, with models, etc.

## Configuration

- `.storybook/main.ts` - Main Storybook configuration
- `.storybook/preview.tsx` - Preview configuration with global styles and dark theme for docs
- `.storybook/manager.ts` - Manager (UI chrome) configuration with dark theme

## Theme

Storybook is configured with a dark theme to match the application:

- Dark UI chrome (sidebar, toolbar, etc.)
- Dark documentation pages
- Dark canvas background (`hsl(0 0% 12%)`) matching the app's `--color-background`

## Visual Regression Testing with Chromatic

This project uses [Chromatic](https://www.chromatic.com/) for automated visual regression testing.

### How it works

- **On PRs**: Chromatic captures snapshots of all stories and compares them to the baseline
- **On main**: Changes are automatically accepted as the new baseline
- **TurboSnap**: Only changed stories are tested, making builds fast (~30s typical)

### Running Chromatic locally

```bash
bun run chromatic
```

You'll need a `CHROMATIC_PROJECT_TOKEN` environment variable set.

### CI Integration

Chromatic runs automatically in CI via `.github/workflows/chromatic.yml`:

- Runs on all PRs and pushes to main
- Visual diffs are shown inline in PR comments
- Won't fail the build on visual changes (for review)

### Configuration

- `chromatic.config.json` - Chromatic settings (TurboSnap, skip patterns, etc.)
- See [Chromatic docs](https://www.chromatic.com/docs/) for more options

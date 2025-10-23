import type { Meta, StoryObj } from "@storybook/react";
import { TitleBar } from "./TitleBar";

const meta = {
  title: "Components/TitleBar",
  component: TitleBar,
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#1e1e1e" }],
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof TitleBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The TitleBar shows the cmux version and build date.
 *
 * Note: The version displayed is generated at build time from git information.
 * In Storybook, you'll see the current development version.
 */
export const Default: Story = {};

export const WithTelemetryDisabled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "When telemetry is disabled, the update indicator shows a disabled state (⊘) and hovering explains updates are disabled.",
      },
    },
  },
};

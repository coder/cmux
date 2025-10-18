import type { Meta, StoryObj } from "@storybook/react";
import { ModelSelector } from "./ModelSelector";
import { action } from "@storybook/addon-actions";

const meta = {
  title: "Components/ModelSelector",
  component: ModelSelector,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "text" },
      description: "Current model value",
    },
    onChange: {
      control: false,
      description: "Callback when model changes",
    },
    recentModels: {
      control: { type: "object" },
      description: "List of recently used models",
    },
    onComplete: {
      control: false,
      description: "Callback when selection is complete",
    },
  },
} satisfies Meta<typeof ModelSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: "anthropic:claude-sonnet-4-5",
    onChange: action("onChange"),
    recentModels: ["anthropic:claude-sonnet-4-5", "anthropic:claude-opus-4-1", "openai:gpt-5-pro"],
    onComplete: action("onComplete"),
  },
};

export const LongModelName: Story = {
  args: {
    value: "anthropic:claude-opus-4-20250514-preview-experimental",
    onChange: action("onChange"),
    recentModels: [
      "anthropic:claude-opus-4-20250514-preview-experimental",
      "anthropic:claude-sonnet-4-20250514-preview-experimental",
      "openai:gpt-5-preview-2025-01-15-experimental",
    ],
    onComplete: action("onComplete"),
  },
};

export const WithManyModels: Story = {
  args: {
    value: "anthropic:claude-sonnet-4-5",
    onChange: action("onChange"),
    recentModels: [
      "anthropic:claude-sonnet-4-5",
      "anthropic:claude-opus-4-1",
      "anthropic:claude-haiku-4-0",
      "openai:gpt-5-pro",
      "openai:gpt-5-mini",
      "openai:gpt-4o",
      "openai:gpt-4o-mini",
    ],
    onComplete: action("onComplete"),
  },
};

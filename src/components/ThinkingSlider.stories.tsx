import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { ThinkingSliderComponent } from "./ThinkingSlider";
import { ThinkingProvider } from "@/contexts/ThinkingContext";

const meta = {
  title: "Components/ThinkingSlider",
  component: ThinkingSliderComponent,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#1e1e1e" }],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    modelString: {
      control: "text",
      description: "Model name that determines thinking policy",
    },
  },
  args: {
    modelString: "anthropic:claude-sonnete-4-5",
  },
  decorators: [
    (Story) => (
      <ThinkingProvider workspaceId="storybook-demo">
        <Story />
      </ThinkingProvider>
    ),
  ],
} satisfies Meta<typeof ThinkingSliderComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const DifferentModels: Story = {
  render: () => (
    <div className="flex flex-col gap-[30px] p-10 bg-[#1e1e1e] min-w-[300px]">
      <div>
        <div className="text-xs text-[#808080] font-primary mb-2">Claude Sonnet 4.5</div>
        <ThinkingSliderComponent modelString="anthropic:claude-sonnete-4-5" />
      </div>

      <div>
        <div className="text-xs text-[#808080] font-primary mb-2">Claude Opus 4.1</div>
        <ThinkingSliderComponent modelString="anthropic:claude-opus-4-1" />
      </div>

      <div>
        <div className="text-xs text-[#808080] font-primary mb-2">GPT-5 Codex</div>
        <ThinkingSliderComponent modelString="openai:gpt-5-codex" />
      </div>
    </div>
  ),
};

export const InteractiveDemo: Story = {
  render: () => (
    <div className="flex flex-col gap-[30px] p-10 bg-[#1e1e1e] min-w-[300px]">
      <div className="text-[13px] text-[#cccccc] font-primary mb-2.5">
        Try moving the slider to see the purple glow effect intensify:
      </div>
      <ThinkingSliderComponent modelString="claude-3-5-sonnet-20241022" />
      <div className="text-[11px] text-[#808080] font-primary mt-2.5">
        • <strong>Off</strong>: No thinking (gray)
        <br />• <strong>Low</strong>: Minimal thinking (light purple)
        <br />• <strong>Medium</strong>: Moderate thinking (purple)
        <br />• <strong>High</strong>: Maximum thinking (bright purple)
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Find the slider
    const slider = canvas.getByRole("slider");

    // Verify slider is present and accessible
    await expect(slider).toBeInTheDocument();
    await expect(slider).toHaveAttribute("type", "range");

    // Initial state should be "off" (value 0)
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
    await expect(slider).toHaveAttribute("aria-valuetext", "off");

    // Note: Testing actual slider interaction via keyboard/mouse is complex
    // The important part is that the slider is accessible and has correct initial state
  },
};

export const LockedThinking: Story = {
  args: { modelString: "openai:gpt-5-pro" },
  render: (args) => (
    <div className="flex flex-col gap-[30px] p-10 bg-[#1e1e1e] min-w-[300px]">
      <div className="text-[13px] text-[#cccccc] font-primary mb-2.5">
        Some models have locked thinking levels based on their capabilities:
      </div>
      <div>
        <div className="text-xs text-[#808080] font-primary mb-2">
          GPT-5-Pro (locked to &ldquo;high&rdquo;)
        </div>
        <ThinkingSliderComponent modelString={args.modelString} />
      </div>
      <div className="text-[11px] text-[#808080] font-primary mt-2.5">
        Hover over the locked indicator to see why it&apos;s fixed.
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Find the level text using aria-label (should be "high" and fixed)
    const levelDisplay = canvasElement.querySelector('[aria-label*="Thinking level fixed"]');
    await expect(levelDisplay).toBeInTheDocument();
    await expect(levelDisplay).toHaveTextContent("high");

    // Verify it's a fixed level (no slider present)
    const slider = canvas.queryByRole("slider");
    await expect(slider).not.toBeInTheDocument();

    // Test passes if we verified the fixed level and no slider
    // Tooltip test is skipped as it's complex with nested structure
  },
};

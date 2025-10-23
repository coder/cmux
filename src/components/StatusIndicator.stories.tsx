import type { Meta, StoryObj } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import { expect, userEvent, waitFor } from "@storybook/test";
import { StatusIndicator } from "./StatusIndicator";
import { useArgs } from "storybook/internal/preview-api";
import { TooltipProvider } from "@/components/ui/tooltip";

const meta = {
  title: "Components/StatusIndicator",
  component: StatusIndicator,
  parameters: {
    layout: "centered",
    controls: {
      exclude: ["onClick", "className"],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    streaming: {
      control: "boolean",
      description: "Whether the indicator is in streaming state",
    },
    unread: {
      control: "boolean",
      description: "Whether there are unread messages",
    },
    size: {
      control: { type: "number", min: 4, max: 20, step: 2 },
      description: "Size of the indicator in pixels",
    },
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof StatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    streaming: false,
    unread: false,
  },
};

export const Streaming: Story = {
  args: {
    streaming: true,
    unread: false,
  },
};

export const Unread: Story = {
  args: {
    streaming: false,
    unread: true,
  },
};

export const AllStates: Story = {
  args: { streaming: false, unread: false },
  render: () => (
    <div className="flex flex-wrap items-center gap-[30px] p-5">
      <div className="flex flex-col items-center gap-2">
        <StatusIndicator streaming={false} unread={false} />
        <span className="text-muted-light font-primary text-[11px]">Default</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <StatusIndicator streaming={true} unread={false} />
        <span className="text-muted-light font-primary text-[11px]">Streaming</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <StatusIndicator streaming={false} unread={true} />
        <span className="text-muted-light font-primary text-[11px]">Unread</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <StatusIndicator streaming={true} unread={true} />
        <span className="text-muted-light font-primary text-[11px]">
          Streaming (unread ignored)
        </span>
      </div>
    </div>
  ),
};

export const DifferentSizes: Story = {
  args: { streaming: false, unread: false },
  render: () => (
    <div className="flex flex-wrap items-center gap-[30px] p-5">
      <div className="flex flex-col items-center gap-2">
        <StatusIndicator streaming={false} unread={true} size={4} />
        <span className="text-muted-light font-primary text-[11px]">4px</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <StatusIndicator streaming={false} unread={true} size={8} />
        <span className="text-muted-light font-primary text-[11px]">8px (default)</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <StatusIndicator streaming={false} unread={true} size={12} />
        <span className="text-muted-light font-primary text-[11px]">12px</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <StatusIndicator streaming={false} unread={true} size={16} />
        <span className="text-muted-light font-primary text-[11px]">16px</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <StatusIndicator streaming={false} unread={true} size={20} />
        <span className="text-muted-light font-primary text-[11px]">20px</span>
      </div>
    </div>
  ),
};

export const WithTooltip: Story = {
  args: {
    streaming: false,
    unread: true,
    title: "3 unread messages",
  },
};

export const Clickable: Story = {
  args: {
    streaming: false,
    unread: true,
    onClick: action("indicator-clicked"),
    title: "Click to mark as read",
  },
  render: function Render(args) {
    const [{ unread }, updateArgs] = useArgs<Story["args"]>();
    return (
      <StatusIndicator {...args} unread={unread} onClick={() => updateArgs({ unread: !unread })} />
    );
  },
  play: async ({ canvasElement }) => {
    // Find the indicator div (inside tooltip trigger when title is provided)
    const indicator = canvasElement.querySelector("div");
    if (!indicator) throw new Error("Could not find indicator");

    // Initial state - should be unread (white background)
    const initialBg = window.getComputedStyle(indicator).backgroundColor;
    await expect(initialBg).toContain("255"); // White color contains 255

    // Click to toggle
    await userEvent.click(indicator);

    // Wait for state change - should become read (gray background)
    await waitFor(() => {
      const newBg = window.getComputedStyle(indicator).backgroundColor;
      void expect(newBg).toContain("110"); // Gray color #6e6e6e contains 110
    });

    // Click again to toggle back
    await userEvent.click(indicator);

    // Should be unread (white) again
    await waitFor(() => {
      const finalBg = window.getComputedStyle(indicator).backgroundColor;
      void expect(finalBg).toContain("255");
    });
  },
};

export const StreamingPreventsClick: Story = {
  args: {
    streaming: true,
    unread: false,
    onClick: action("indicator-clicked"),
  },
  render: function Render(args) {
    const [{ unread }, updateArgs] = useArgs<Story["args"]>();
    return (
      <StatusIndicator {...args} unread={unread} onClick={() => updateArgs({ unread: !unread })} />
    );
  },
  play: async ({ canvasElement }) => {
    // Find the indicator div
    const indicator = canvasElement.querySelector("div");
    if (!indicator) throw new Error("Could not find indicator");

    // Verify cursor is default (not clickable) when streaming
    const cursorStyle = window.getComputedStyle(indicator).cursor;
    await expect(cursorStyle).toBe("default");

    // Try to click - state should NOT change
    await userEvent.click(indicator);

    // Brief wait to ensure no state change occurs
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify cursor is still default (state hasn't changed)
    const cursorAfter = window.getComputedStyle(indicator).cursor;
    await expect(cursorAfter).toBe("default");
  },
};

export const WithTooltipInteraction: Story = {
  args: {
    streaming: false,
    unread: true,
    title: "3 unread messages",
  },
  play: async ({ canvasElement }) => {
    // Find the wrapper span
    const wrapper = canvasElement.querySelector("span");
    if (!wrapper) throw new Error("Could not find wrapper");

    // Hover over the indicator to show tooltip
    await userEvent.hover(wrapper);

    // Wait for tooltip to appear (uses portal to document.body)
    await waitFor(
      async () => {
        const tooltip = document.body.querySelector(".tooltip");
        await expect(tooltip).toBeInTheDocument();
        await expect(tooltip).toHaveTextContent("3 unread messages");
      },
      { timeout: 2000 }
    );

    // Unhover to hide tooltip
    await userEvent.unhover(wrapper);

    // Wait for tooltip to disappear
    await waitFor(
      async () => {
        const tooltip = document.body.querySelector(".tooltip");
        await expect(tooltip).not.toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  },
};

export const InContext: Story = {
  args: { streaming: false, unread: false },
  parameters: {
    controls: { disable: true },
  },
  render: () => {
    return (
      <div className="flex flex-col gap-2">
        <div className="bg-modal-bg font-primary text-bright flex items-center gap-2 rounded px-3 py-2 text-[13px]">
          <StatusIndicator streaming={false} unread={false} />
          <span>workspace-feature-branch</span>
        </div>

        <div className="bg-modal-bg font-primary text-bright flex items-center gap-2 rounded px-3 py-2 text-[13px]">
          <StatusIndicator streaming={true} unread={false} />
          <span>workspace-main (streaming)</span>
        </div>

        <div className="bg-modal-bg font-primary text-bright flex items-center gap-2 rounded px-3 py-2 text-[13px]">
          <StatusIndicator streaming={false} unread={true} />
          <span>workspace-bugfix (3 unread)</span>
        </div>
      </div>
    );
  },
};

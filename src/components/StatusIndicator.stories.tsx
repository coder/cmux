import type { Meta, StoryObj } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import { expect, userEvent, waitFor } from "@storybook/test";
import { StatusIndicator } from "./StatusIndicator";
import styled from "@emotion/styled";
import { useArgs } from "storybook/internal/preview-api";

const DemoContainer = styled.div`
  display: flex;
  gap: 30px;
  padding: 20px;
  align-items: center;
  flex-wrap: wrap;
`;

const DemoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
`;

const Label = styled.span`
  font-size: 11px;
  color: #808080;
  font-family: var(--font-primary);
`;

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
    <DemoContainer>
      <DemoItem>
        <StatusIndicator streaming={false} unread={false} />
        <Label>Default</Label>
      </DemoItem>

      <DemoItem>
        <StatusIndicator streaming={true} unread={false} />
        <Label>Streaming</Label>
      </DemoItem>

      <DemoItem>
        <StatusIndicator streaming={false} unread={true} />
        <Label>Unread</Label>
      </DemoItem>

      <DemoItem>
        <StatusIndicator streaming={true} unread={true} />
        <Label>Streaming (unread ignored)</Label>
      </DemoItem>
    </DemoContainer>
  ),
};

export const DifferentSizes: Story = {
  args: { streaming: false, unread: false },
  render: () => (
    <DemoContainer>
      <DemoItem>
        <StatusIndicator streaming={false} unread={true} size={4} />
        <Label>4px</Label>
      </DemoItem>

      <DemoItem>
        <StatusIndicator streaming={false} unread={true} size={8} />
        <Label>8px (default)</Label>
      </DemoItem>

      <DemoItem>
        <StatusIndicator streaming={false} unread={true} size={12} />
        <Label>12px</Label>
      </DemoItem>

      <DemoItem>
        <StatusIndicator streaming={false} unread={true} size={16} />
        <Label>16px</Label>
      </DemoItem>

      <DemoItem>
        <StatusIndicator streaming={false} unread={true} size={20} />
        <Label>20px</Label>
      </DemoItem>
    </DemoContainer>
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
    // Find the indicator div directly
    const wrapper = canvasElement.querySelector("span");
    const indicator = wrapper?.querySelector("div");
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
    const WorkspaceItem = styled.div`
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #2d2d30;
      border-radius: 4px;
      font-family: var(--font-primary);
      font-size: 13px;
      color: #cccccc;
    `;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <WorkspaceItem>
          <StatusIndicator streaming={false} unread={false} />
          <span>workspace-feature-branch</span>
        </WorkspaceItem>

        <WorkspaceItem>
          <StatusIndicator streaming={true} unread={false} />
          <span>workspace-main (streaming)</span>
        </WorkspaceItem>

        <WorkspaceItem>
          <StatusIndicator streaming={false} unread={true} />
          <span>workspace-bugfix (3 unread)</span>
        </WorkspaceItem>
      </div>
    );
  },
};

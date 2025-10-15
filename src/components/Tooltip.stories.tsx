import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within, waitFor } from "@storybook/test";
import { TooltipWrapper, Tooltip, HelpIndicator } from "./Tooltip";
import styled from "@emotion/styled";

const DemoButton = styled.button`
  padding: 8px 16px;
  background: #0e639c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-primary);
  font-size: 13px;

  &:hover {
    background: #1177bb;
  }
`;

const DemoContainer = styled.div`
  display: flex;
  gap: 20px;
  padding: 40px;
  flex-wrap: wrap;
`;

const meta = {
  title: "Components/Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicTooltip: Story = {
  args: { children: "This is a helpful tooltip" },
  render: () => (
    <TooltipWrapper>
      <DemoButton>Hover me</DemoButton>
      <Tooltip>This is a helpful tooltip</Tooltip>
    </TooltipWrapper>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Find the button to hover
    const button = canvas.getByRole("button", { name: /hover me/i });

    // Initially tooltip should not be in the document
    let tooltip = document.body.querySelector(".tooltip");
    void expect(tooltip).not.toBeInTheDocument();

    // Hover over the button
    await userEvent.hover(button);

    // Wait for tooltip to appear in document.body (portal)
    await waitFor(
      () => {
        tooltip = document.body.querySelector(".tooltip");
        void expect(tooltip).toBeInTheDocument();
        void expect(tooltip).toHaveTextContent("This is a helpful tooltip");
      },
      { timeout: 2000 }
    );

    // Unhover to hide tooltip
    await userEvent.unhover(button);

    // Wait for tooltip to disappear
    await waitFor(
      () => {
        tooltip = document.body.querySelector(".tooltip");
        void expect(tooltip).not.toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  },
};

export const TooltipPositions: Story = {
  args: { children: "Tooltip content" },
  render: () => (
    <DemoContainer>
      <TooltipWrapper>
        <DemoButton>Top (default)</DemoButton>
        <Tooltip position="top">Tooltip appears above</Tooltip>
      </TooltipWrapper>

      <TooltipWrapper>
        <DemoButton>Bottom</DemoButton>
        <Tooltip position="bottom">Tooltip appears below</Tooltip>
      </TooltipWrapper>
    </DemoContainer>
  ),
};

export const TooltipAlignments: Story = {
  args: { children: "Tooltip content" },
  render: () => (
    <DemoContainer>
      <TooltipWrapper>
        <DemoButton>Left Aligned</DemoButton>
        <Tooltip align="left">Left-aligned tooltip</Tooltip>
      </TooltipWrapper>

      <TooltipWrapper>
        <DemoButton>Center Aligned</DemoButton>
        <Tooltip align="center">Center-aligned tooltip</Tooltip>
      </TooltipWrapper>

      <TooltipWrapper>
        <DemoButton>Right Aligned</DemoButton>
        <Tooltip align="right">Right-aligned tooltip</Tooltip>
      </TooltipWrapper>
    </DemoContainer>
  ),
};

export const WideTooltip: Story = {
  args: { children: "Tooltip content" },
  render: () => (
    <TooltipWrapper>
      <DemoButton>Hover for detailed info</DemoButton>
      <Tooltip width="wide">
        This is a wider tooltip that can contain more detailed information. It will wrap text
        automatically and has a maximum width of 300px.
      </Tooltip>
    </TooltipWrapper>
  ),
};

export const WithHelpIndicator: Story = {
  args: { children: "Tooltip content" },
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span>Need help?</span>
      <TooltipWrapper inline>
        <HelpIndicator>?</HelpIndicator>
        <Tooltip align="center" width="wide">
          Click here to open the help documentation. You can also press Cmd+Shift+H to quickly
          access help.
        </Tooltip>
      </TooltipWrapper>
    </div>
  ),
};

export const InlineTooltip: Story = {
  args: { children: "Tooltip content" },
  render: () => (
    <div style={{ fontSize: "14px", fontFamily: "var(--font-primary)" }}>
      This is some text with an{" "}
      <TooltipWrapper inline>
        <span style={{ color: "#0e639c", cursor: "pointer", textDecoration: "underline" }}>
          inline tooltip
        </span>
        <Tooltip>Additional context appears here</Tooltip>
      </TooltipWrapper>{" "}
      embedded in the sentence.
    </div>
  ),
};

export const KeyboardShortcut: Story = {
  args: { children: "Tooltip content" },
  render: () => (
    <TooltipWrapper>
      <DemoButton>Save File</DemoButton>
      <Tooltip align="center">
        Save File <kbd>⌘S</kbd>
      </Tooltip>
    </TooltipWrapper>
  ),
};

export const LongContent: Story = {
  args: { children: "Tooltip content" },
  render: () => (
    <TooltipWrapper>
      <DemoButton>Documentation</DemoButton>
      <Tooltip width="wide">
        <strong>Getting Started:</strong>
        <br />
        1. Create a new workspace
        <br />
        2. Select your preferred model
        <br />
        3. Start chatting with the AI
        <br />
        <br />
        Press Cmd+K to open the command palette.
      </Tooltip>
    </TooltipWrapper>
  ),
};

import type { Meta, StoryObj } from "@storybook/react";
import { TipsCarousel } from "./TipsCarousel";
import styled from "@emotion/styled";

const DemoContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  background: #1e1e1e;
  min-width: 500px;
`;

const meta = {
  title: "Components/TipsCarousel",
  component: TipsCarousel,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#1e1e1e" }],
    },
  },
  tags: ["autodocs"],
  argTypes: {},
} satisfies Meta<typeof TipsCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <TipsCarousel />,
};

export const WithExplanation: Story = {
  render: () => (
    <DemoContainer>
      <div
        style={{
          fontSize: "13px",
          color: "#cccccc",
          fontFamily: "var(--font-primary)",
        }}
      >
        Tips rotate automatically based on time. Hover to see the gradient effect:
      </div>
      <TipsCarousel />
      <div
        style={{
          fontSize: "11px",
          color: "#808080",
          fontFamily: "var(--font-primary)",
        }}
      >
        Tips change every hour to provide variety and convey UX information.
      </div>
    </DemoContainer>
  ),
};

export const DebugControls: Story = {
  render: () => (
    <DemoContainer>
      <div
        style={{
          fontSize: "13px",
          color: "#cccccc",
          fontFamily: "var(--font-primary)",
        }}
      >
        For debugging, you can use:
      </div>
      <TipsCarousel />
      <div
        style={{
          fontSize: "11px",
          color: "#808080",
          fontFamily: "var(--font-monospace)",
          padding: "12px",
          background: "#2d2d30",
          borderRadius: "4px",
        }}
      >
        <div>window.setTip(0) // Show first tip</div>
        <div>window.setTip(1) // Show second tip</div>
        <div>window.clearTip() // Return to auto-rotation</div>
      </div>
    </DemoContainer>
  ),
};

export const InContext: Story = {
  render: () => {
    const ToolbarMock = styled.div`
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: #252526;
      border-bottom: 1px solid #3e3e42;
      font-family: var(--font-primary);
    `;

    const ToolbarSection = styled.div`
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    return (
      <ToolbarMock>
        <ToolbarSection>
          <span style={{ fontSize: "11px", color: "#808080" }}>Workspace:</span>
          <span style={{ fontSize: "11px", color: "#cccccc" }}>main</span>
        </ToolbarSection>
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <TipsCarousel />
        </div>
        <ToolbarSection>
          <span style={{ fontSize: "11px", color: "#808080" }}>Mode: Plan</span>
        </ToolbarSection>
      </ToolbarMock>
    );
  },
};

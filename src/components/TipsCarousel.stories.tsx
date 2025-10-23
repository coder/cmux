import type { Meta, StoryObj } from "@storybook/react";
import { TipsCarousel } from "./TipsCarousel";

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
  render: () => <TipsCarousel fixedTipIndex={0} />,
};

export const WithExplanation: Story = {
  render: () => (
    <div className="flex flex-col gap-5 p-5 bg-[#1e1e1e] min-w-[500px]">
      <div className="text-[13px] text-[#cccccc] font-primary">
        Tips rotate automatically based on time. Hover to see the gradient effect:
      </div>
      <TipsCarousel fixedTipIndex={0} />
      <div className="text-[11px] text-[#808080] font-primary">
        Tips change every hour to provide variety and convey UX information.
      </div>
    </div>
  ),
};

export const DebugControls: Story = {
  render: () => (
    <div className="flex flex-col gap-5 p-5 bg-[#1e1e1e] min-w-[500px]">
      <div className="text-[13px] text-[#cccccc] font-primary">For debugging, you can use:</div>
      <TipsCarousel fixedTipIndex={1} />
      <div className="text-[11px] text-[#808080] font-monospace p-3 bg-[#2d2d30] rounded">
        <div>window.setTip(0) // Show first tip</div>
        <div>window.setTip(1) // Show second tip</div>
        <div>window.clearTip() // Return to auto-rotation</div>
      </div>
    </div>
  ),
};

export const InContext: Story = {
  render: () => {
    return (
      <div className="flex items-center gap-3 py-2 px-3 bg-[#252526] border-b border-[#3e3e42] font-primary">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#808080]">Workspace:</span>
          <span className="text-[11px] text-[#cccccc]">main</span>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <TipsCarousel fixedTipIndex={0} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#808080]">Mode: Plan</span>
        </div>
      </div>
    );
  },
};

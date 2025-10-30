import type { Meta, StoryObj } from "@storybook/react-vite";
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
    <div className="flex min-w-96 flex-col gap-5 bg-neutral-900 p-5">
      <div className="font-primary text-[13px] text-neutral-300">
        Tips rotate automatically based on time. Hover to see the gradient effect:
      </div>
      <TipsCarousel fixedTipIndex={0} />
      <div className="text-neutral-400-light font-primary text-[11px]">
        Tips change every hour to provide variety and convey UX information.
      </div>
    </div>
  ),
};

export const DebugControls: Story = {
  render: () => (
    <div className="flex min-w-96 flex-col gap-5 bg-neutral-900 p-5">
      <div className="font-primary text-[13px] text-neutral-300">For debugging, you can use:</div>
      <TipsCarousel fixedTipIndex={1} />
      <div className="text-neutral-400-light font-monospace rounded bg-neutral-900 p-3 text-[11px]">
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
      <div className="font-primary flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-neutral-400-light text-[11px]">Workspace:</span>
          <span className="text-[11px] text-neutral-300">main</span>
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
          <span className="text-neutral-400-light text-[11px]">Mode: Plan</span>
        </div>
      </div>
    );
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { AssistantMessage } from "./AssistantMessage";
import type { DisplayedMessage } from "@/types/message";

const meta = {
  title: "Messages/AssistantMessage",
  component: AssistantMessage,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AssistantMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

// Helper to create assistant message data
const createAssistantMessage = (
  overrides?: Partial<DisplayedMessage & { type: "assistant" }>
): DisplayedMessage & { type: "assistant" } => ({
  type: "assistant",
  id: "msg-1",
  historyId: "hist-1",
  content: "This is a sample assistant message with **markdown** support.",
  historySequence: 1,
  streamSequence: 0,
  isStreaming: false,
  isPartial: false,
  timestamp: Date.now(),
  ...overrides,
});

export const Default: Story = {
  args: {
    message: createAssistantMessage(),
  },
};

export const WithModel: Story = {
  args: {
    message: createAssistantMessage({
      model: "Claude-3.5-Sonnet",
      content: "I'm a message from Claude 3.5 Sonnet with the model name displayed.",
    }),
  },
};

export const LongContent: Story = {
  args: {
    message: createAssistantMessage({
      content: `This is a longer assistant message that demonstrates how the component handles multiple paragraphs and more complex markdown formatting.

## Features
- **Bold text** for emphasis
- *Italic text* for subtle emphasis
- \`inline code\` for technical terms

### Code Blocks
Here's an example:

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

The component should handle all of this gracefully with proper formatting.`,
    }),
  },
};

export const Streaming: Story = {
  args: {
    message: createAssistantMessage({
      content: "This message is currently streaming...",
      isStreaming: true,
    }),
  },
};

export const StreamingEmpty: Story = {
  args: {
    message: createAssistantMessage({
      content: "",
      isStreaming: true,
    }),
  },
};

export const PartialMessage: Story = {
  args: {
    message: createAssistantMessage({
      content: "This message was interrupted and is incomplete",
      isPartial: true,
      model: "gpt-4",
    }),
  },
};

export const WithTokenCount: Story = {
  args: {
    message: createAssistantMessage({
      content: "This message includes token usage information.",
      tokens: 1250,
      model: "claude-3-opus",
    }),
  },
};

export const EmptyContent: Story = {
  args: {
    message: createAssistantMessage({
      content: "",
      isStreaming: false,
    }),
  },
};

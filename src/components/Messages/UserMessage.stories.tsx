import type { Meta, StoryObj } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import { UserMessage } from "./UserMessage";
import type { DisplayedMessage } from "@/types/message";

const clipboardWriteText = (data: string) => {
  action("copy-text")(data);
  return Promise.resolve();
};

const meta = {
  title: "Messages/UserMessage",
  component: UserMessage,
  parameters: {
    layout: "padded",
    controls: {
      exclude: ["onEdit", "className", "clipboardWriteText"],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    message: {
      control: "object",
      description: "User message data",
    },
  },
  args: {
    onEdit: action("onEdit"),
    clipboardWriteText,
  },
} satisfies Meta<typeof UserMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

const createUserMessage = (
  content: string,
  overrides?: Partial<DisplayedMessage & { type: "user" }>
): DisplayedMessage & { type: "user" } => ({
  type: "user",
  id: "user-msg-1",
  historyId: "hist-1",
  content,
  historySequence: 1,
  timestamp: Date.now(),
  ...overrides,
});

export const BasicText: Story = {
  args: {
    message: createUserMessage("Can you help me debug this function?"),
  },
};

export const MultilineText: Story = {
  args: {
    message: createUserMessage(
      "Here's my code:\n\nfunction calculate(x, y) {\n  return x + y;\n}\n\nWhat's wrong with it?"
    ),
  },
};

export const WithEditHandler: Story = {
  args: {
    message: createUserMessage("I need to edit this message"),
  },
};

export const WithSingleImage: Story = {
  args: {
    message: createUserMessage("What's in this image?", {
      imageParts: [
        {
          image: "https://placehold.co/600x400",
          mimeType: "image/png",
        },
      ],
    }),
  },
};

export const WithMultipleImages: Story = {
  args: {
    message: createUserMessage("Compare these screenshots:", {
      imageParts: [
        {
          image: "https://placehold.co/600x400?text=Before",
          mimeType: "image/png",
        },
        {
          image: "https://placehold.co/600x400?text=After",
          mimeType: "image/png",
        },
        {
          image: "https://placehold.co/600x400?text=Expected",
          mimeType: "image/png",
        },
      ],
    }),
  },
};

export const LongText: Story = {
  args: {
    message: createUserMessage(
      "I'm working on a complex problem that requires a detailed explanation. " +
        "The issue involves multiple components interacting with each other, and I need to understand " +
        "how to properly structure the data flow between them. Specifically, I'm dealing with state " +
        "management in a React application where I have parent components passing props down to children, " +
        "but I also need some children to communicate back up to parents. Should I use callbacks, " +
        "context, or a state management library like Redux or Zustand? What are the tradeoffs?"
    ),
  },
};

export const EmptyContent: Story = {
  args: {
    message: createUserMessage("", {
      imageParts: [
        {
          image: "https://placehold.co/300x400?text=Image+Only",
          mimeType: "image/png",
        },
      ],
    }),
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { ProjectErrorModal } from "./ProjectErrorModal";

const meta = {
  title: "Components/ProjectErrorModal",
  component: ProjectErrorModal,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    error: {
      control: "text",
      description: "Error message to display (null = modal closed)",
    },
    onClose: {
      control: false,
      action: "onClose",
    },
  },
  args: {
    onClose: action("close-clicked"),
  },
} satisfies Meta<typeof ProjectErrorModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotAGitRepository: Story = {
  args: {
    error: "Not a git repository: /home/user/my-project",
  },
};

export const PathDoesNotExist: Story = {
  args: {
    error: "Path does not exist: /home/user/nonexistent-project",
  },
};

export const PathIsNotDirectory: Story = {
  args: {
    error: "Path is not a directory: /home/user/file.txt",
  },
};

export const ProjectAlreadyExists: Story = {
  args: {
    error: "This project has already been added.",
  },
};

export const GenericError: Story = {
  args: {
    error: "Failed to add project: An unexpected error occurred",
  },
};

export const Closed: Story = {
  args: {
    error: null,
  },
};

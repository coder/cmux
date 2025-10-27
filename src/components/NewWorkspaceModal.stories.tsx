import type { Meta, StoryObj } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import NewWorkspaceModal from "./NewWorkspaceModal";

const meta = {
  title: "Components/NewWorkspaceModal",
  component: NewWorkspaceModal,
  parameters: {
    layout: "fullscreen",
    controls: {
      exclude: ["onClose", "onAdd"],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    isOpen: {
      control: "boolean",
      description: "Whether the modal is visible",
    },
    projectName: {
      control: "text",
      description: "Name of the project",
    },
    projectPath: {
      control: "text",
      description: "Path to the project",
    },
    branches: {
      control: "object",
      description: "List of available branches",
    },
    defaultTrunkBranch: {
      control: "text",
      description: "Recommended trunk branch (optional)",
    },
  },
  args: {
    onClose: action("onClose"),
    onAdd: async (branchName: string, trunkBranch: string) => {
      action("onAdd")({ branchName, trunkBranch });
      // Simulate async operation
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
  },
} satisfies Meta<typeof NewWorkspaceModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isOpen: true,
    projectName: "my-project",
    projectPath: "/path/to/my-project",
    branches: ["main", "develop", "feature/new-feature"],
    defaultTrunkBranch: "main",
  },
};

export const LongProjectName: Story = {
  args: {
    isOpen: true,
    projectName: "very-long-project-name-that-demonstrates-wrapping",
    projectPath: "/path/to/very-long-project-name-that-demonstrates-wrapping",
    branches: ["main", "develop"],
    defaultTrunkBranch: "main",
  },
};

export const NoBranches: Story = {
  args: {
    isOpen: true,
    projectName: "empty-project",
    projectPath: "/path/to/empty-project",
    branches: [],
  },
};

export const ManyBranches: Story = {
  args: {
    isOpen: true,
    projectName: "active-project",
    projectPath: "/path/to/active-project",
    branches: [
      "main",
      "develop",
      "staging",
      "feature/authentication",
      "feature/dashboard",
      "bugfix/memory-leak",
      "release/v1.2.0",
    ],
    defaultTrunkBranch: "develop",
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
    projectName: "my-project",
    projectPath: "/path/to/my-project",
    branches: ["main", "develop"],
    defaultTrunkBranch: "main",
  },
};

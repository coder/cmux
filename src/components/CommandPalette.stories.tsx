import type { Meta, StoryObj } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import { CommandPalette } from "./CommandPalette";
import { CommandRegistryProvider } from "@/contexts/CommandRegistryContext";
import type { CommandAction } from "@/contexts/CommandRegistryContext";
import { useEffect } from "react";
import { useCommandRegistry } from "@/contexts/CommandRegistryContext";
import styled from "@emotion/styled";

const StoryWrapper = styled.div`
  min-height: 600px;
  background: #1e1e1e;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const InfoBox = styled.div`
  padding: 16px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #cccccc;
  font-family: var(--font-primary);
  font-size: 13px;
  line-height: 1.6;

  kbd {
    padding: 2px 6px;
    background: #1e1e1e;
    border: 1px solid #3e3e42;
    border-radius: 3px;
    font-family: var(--font-monospace);
    font-size: 11px;
  }
`;

const ReopenButton = styled.button`
  padding: 8px 16px;
  background: #0e639c;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-family: var(--font-primary);
  font-size: 13px;
  cursor: pointer;
  align-self: flex-start;

  &:hover {
    background: #1177bb;
  }

  &:active {
    background: #0d5689;
  }
`;

// Mock command actions for the demo
const mockCommands: CommandAction[] = [
  {
    id: "workspace.create",
    title: "Create New Workspace",
    subtitle: "Start a new workspace in this project",
    section: "Workspace",
    keywords: ["new", "add", "workspace"],
    shortcutHint: "⌘N",
    run: () => action("command-executed")("workspace.create"),
  },
  {
    id: "workspace.switch",
    title: "Switch Workspace",
    subtitle: "Navigate to a different workspace",
    section: "Workspace",
    keywords: ["change", "go to", "workspace"],
    shortcutHint: "⌘P",
    run: () => action("command-executed")("workspace.switch"),
  },
  {
    id: "workspace.delete",
    title: "Delete Workspace",
    subtitle: "Remove the current workspace",
    section: "Workspace",
    keywords: ["remove", "delete", "workspace"],
    run: () => action("command-executed")("workspace.delete"),
  },
  {
    id: "chat.clear",
    title: "Clear Chat History",
    subtitle: "Remove all messages from current chat",
    section: "Chat",
    keywords: ["clear", "delete", "history", "messages"],
    run: () => action("command-executed")("chat.clear"),
  },
  {
    id: "chat.export",
    title: "Export Chat",
    subtitle: "Export conversation to file",
    section: "Chat",
    keywords: ["export", "save", "download"],
    run: () => action("command-executed")("chat.export"),
  },
  {
    id: "mode.toggle",
    title: "Toggle Mode",
    subtitle: "Switch between Plan and Exec modes",
    section: "Mode",
    keywords: ["mode", "switch", "plan", "exec"],
    shortcutHint: "⌘⇧M",
    run: () => action("command-executed")("mode.toggle"),
  },
  {
    id: "thinking.cycle",
    title: "Cycle Thinking Level",
    subtitle: "Change AI thinking intensity",
    section: "Settings",
    keywords: ["thinking", "level", "cycle"],
    shortcutHint: "⌘⇧T",
    run: () => action("command-executed")("thinking.cycle"),
  },
  {
    id: "model.change",
    title: "Change Model",
    subtitle: "Select a different AI model",
    section: "Settings",
    keywords: ["model", "ai", "change", "switch"],
    shortcutHint: "⌘⇧K",
    run: () => action("command-executed")("model.change"),
  },
  {
    id: "project.add",
    title: "Add Project",
    subtitle: "Add a new project to sidebar",
    section: "Project",
    keywords: ["add", "new", "project"],
    run: () => action("command-executed")("project.add"),
  },
  {
    id: "project.remove",
    title: "Remove Project",
    subtitle: "Remove project from sidebar",
    section: "Project",
    keywords: ["remove", "delete", "project"],
    run: () => action("command-executed")("project.remove"),
  },
  {
    id: "help.keybinds",
    title: "Show Keyboard Shortcuts",
    subtitle: "View all available keybindings",
    section: "Help",
    keywords: ["help", "shortcuts", "keybinds", "keys"],
    shortcutHint: "⌘/",
    run: () => action("command-executed")("help.keybinds"),
  },
  {
    id: "help.docs",
    title: "Open Documentation",
    subtitle: "View cmux documentation",
    section: "Help",
    keywords: ["help", "docs", "documentation"],
    run: () => action("command-executed")("help.docs"),
  },
];

// Component that registers mock commands and opens the palette
const PaletteDemo: React.FC<{ autoOpen?: boolean }> = ({ autoOpen = true }) => {
  const { registerSource, open } = useCommandRegistry();

  useEffect(() => {
    // Register mock command source
    const unregister = registerSource(() => mockCommands);

    // Auto-open palette for demo
    if (autoOpen) {
      setTimeout(() => open(), 100);
    }

    return unregister;
  }, [registerSource, open, autoOpen]);

  return (
    <>
      <ReopenButton onClick={() => open()}>Open Command Palette (⌘⇧P)</ReopenButton>
      <CommandPalette
        getSlashContext={() => ({
          providerNames: ["anthropic", "openai", "google"],
          workspaceId: "demo-workspace",
        })}
      />
    </>
  );
};

const meta = {
  title: "Components/CommandPalette",
  component: CommandPalette,
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#1e1e1e" }],
    },
    controls: {
      exclude: ["getSlashContext"],
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <CommandRegistryProvider>
        <Story />
      </CommandRegistryProvider>
    ),
  ],
} satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <InfoBox>
        <strong>Command Palette</strong>
        <br />
        <br />
        The command palette is automatically opened for demonstration. Click the button below to
        reopen it.
        <br />
        <br />
        <strong>Features:</strong>
        <br />
        • Type to filter commands by title, subtitle, or keywords
        <br />
        • Use ↑↓ arrow keys to navigate
        <br />
        • Press Enter to execute a command
        <br />
        • Press Escape to close
        <br />• Start with <kbd>/</kbd> to see slash commands
        <br />• Commands are organized into sections (Workspace, Chat, Mode, Settings, Project,
        Help)
      </InfoBox>
      <PaletteDemo />
    </StoryWrapper>
  ),
};

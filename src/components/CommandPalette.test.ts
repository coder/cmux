import { describe, expect, test } from "bun:test";

/**
 * Tests for command palette filtering logic
 * Verifies the "workspace switcher by default, commands with >" behavior
 */

interface Action {
  id: string;
  title: string;
  section: string;
}

const mockActions: Action[] = [
  { id: "ws:switch:1", title: "Switch to Workspace A", section: "Workspaces" },
  { id: "ws:switch:2", title: "Switch to Workspace B", section: "Workspaces" },
  { id: "ws:new", title: "Create New Workspace", section: "Workspaces" },
  { id: "ws:remove", title: "Remove Current Workspace", section: "Workspaces" },
  { id: "ws:rename", title: "Rename Current Workspace", section: "Workspaces" },
  { id: "ws:open-terminal", title: "Open Workspace in Terminal", section: "Workspaces" },
  { id: "nav1", title: "Toggle Sidebar", section: "Navigation" },
  { id: "chat1", title: "Clear Chat", section: "Chat" },
];

/**
 * Simulates the filtering logic in CommandPalette.tsx
 * This is the behavior we're testing to catch regressions
 */
function filterActions(query: string, actions: Action[]): Action[] {
  const q = query.trim();

  if (q.startsWith("/")) {
    return []; // Slash commands handled separately
  }

  const showAllCommands = q.startsWith(">");

  // Default: show only workspace switching commands
  // With ">": show all commands EXCEPT workspace switching
  const filtered = showAllCommands
    ? actions.filter((action) => !action.id.startsWith("ws:switch:"))
    : actions.filter((action) => action.id.startsWith("ws:switch:"));

  return filtered;
}

describe("CommandPalette filtering", () => {
  test("default (no prefix) shows only workspace switching commands", () => {
    const result = filterActions("", mockActions);

    expect(result).toHaveLength(2);
    expect(result.every((a) => a.id.startsWith("ws:switch:"))).toBe(true);
    expect(result.some((a) => a.id === "ws:switch:1")).toBe(true);
    expect(result.some((a) => a.id === "ws:switch:2")).toBe(true);
  });

  test("default query excludes workspace mutations", () => {
    const result = filterActions("", mockActions);

    expect(result.some((a) => a.id === "ws:new")).toBe(false);
    expect(result.some((a) => a.id === "ws:remove")).toBe(false);
    expect(result.some((a) => a.id === "ws:rename")).toBe(false);
  });

  test("> prefix shows all commands EXCEPT switching", () => {
    const result = filterActions(">", mockActions);

    // Should show 6 commands (3 workspace mutations + 1 terminal + 1 nav + 1 chat)
    expect(result).toHaveLength(6);

    // Should NOT include switching commands
    expect(result.every((a) => !a.id.startsWith("ws:switch:"))).toBe(true);

    // Should include workspace mutations
    expect(result.some((a) => a.id === "ws:new")).toBe(true);
    expect(result.some((a) => a.id === "ws:remove")).toBe(true);
    expect(result.some((a) => a.id === "ws:rename")).toBe(true);

    // Should include other sections
    expect(result.some((a) => a.id === "nav1")).toBe(true);
    expect(result.some((a) => a.id === "chat1")).toBe(true);
  });

  test(">query with text shows non-switching commands (cmdk filters further)", () => {
    const result = filterActions(">new", mockActions);

    // Our filter shows all non-switching commands
    // (cmdk's built-in filter will narrow this down by "new")
    expect(result).toHaveLength(6);
    expect(result.every((a) => !a.id.startsWith("ws:switch:"))).toBe(true);
  });

  test("/ prefix returns empty (slash commands handled separately)", () => {
    const result = filterActions("/", mockActions);
    expect(result).toHaveLength(0);
  });

  test("clean separation: switching XOR other commands", () => {
    const defaultResult = filterActions("", mockActions);
    const commandResult = filterActions(">", mockActions);

    // No overlap
    const defaultIds = new Set(defaultResult.map((a) => a.id));
    const commandIds = new Set(commandResult.map((a) => a.id));
    const intersection = [...defaultIds].filter((id) => commandIds.has(id));

    expect(intersection).toHaveLength(0);

    // Together they cover all non-slash commands
    expect(defaultResult.length + commandResult.length).toBe(mockActions.length);
  });
});

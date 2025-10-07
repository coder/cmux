import { buildCoreSources } from "./sources";
import type { ProjectConfig } from "@/config";
import type { WorkspaceMetadata } from "@/types/workspace";

const mk = (over: Partial<Parameters<typeof buildCoreSources>[0]> = {}) => {
  const projects = new Map<string, ProjectConfig>();
  projects.set("/repo/a", { path: "/repo/a", workspaces: [{ path: "/repo/a/feat-x" }] });
  const workspaceMetadata = new Map<string, WorkspaceMetadata>();
  workspaceMetadata.set("/repo/a/feat-x", {
    id: "w1",
    projectName: "a",
    workspacePath: "/repo/a/feat-x",
  } as WorkspaceMetadata);
  const params: Parameters<typeof buildCoreSources>[0] = {
    projects,
    workspaceMetadata,
    selectedWorkspace: {
      projectPath: "/repo/a",
      projectName: "a",
      workspacePath: "/repo/a/feat-x",
      workspaceId: "w1",
    },
    streamingModels: new Map<string, string>(),
    getThinkingLevel: () => "off",
    onSetThinkingLevel: () => undefined,
    onCreateWorkspace: async () => {
      await Promise.resolve();
    },
    onOpenNewWorkspaceModal: () => undefined,
    onSelectWorkspace: () => undefined,
    onRemoveWorkspace: () => Promise.resolve({ success: true }),
    onRenameWorkspace: () => Promise.resolve({ success: true }),
    onAddProject: () => undefined,
    onRemoveProject: () => undefined,
    onToggleSidebar: () => undefined,
    onNavigateWorkspace: () => undefined,
    onOpenWorkspaceInTerminal: () => undefined,
    ...over,
  };
  return buildCoreSources(params);
};

test("buildCoreSources includes create/switch workspace actions", () => {
  const sources = mk();
  const actions = sources.flatMap((s) => s());
  const titles = actions.map((a) => a.title);
  expect(titles.some((t) => t.startsWith("Create New Workspace"))).toBe(true);
  expect(titles.some((t) => t.includes("Switch to "))).toBe(true);
  expect(titles.includes("Open Current Workspace in Terminal")).toBe(true);
  expect(titles.includes("Open Workspace in Terminal…")).toBe(true);
});

test("buildCoreSources adds thinking effort command", () => {
  const sources = mk({ getThinkingLevel: () => "medium" });
  const actions = sources.flatMap((s) => s());
  const thinkingAction = actions.find((a) => a.id === "thinking:set-level");

  expect(thinkingAction).toBeDefined();
  expect(thinkingAction?.subtitle).toContain("Medium");
});

test("thinking effort command submits selected level", async () => {
  const onSetThinkingLevel = jest.fn();
  const sources = mk({ onSetThinkingLevel, getThinkingLevel: () => "low" });
  const actions = sources.flatMap((s) => s());
  const thinkingAction = actions.find((a) => a.id === "thinking:set-level");

  expect(thinkingAction?.prompt).toBeDefined();
  await thinkingAction!.prompt!.onSubmit({ thinkingLevel: "high" });

  expect(onSetThinkingLevel).toHaveBeenCalledWith("w1", "high");
});

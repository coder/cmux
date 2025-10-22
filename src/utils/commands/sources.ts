import type { CommandAction } from "@/contexts/CommandRegistryContext";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";
import type { ThinkingLevel } from "@/types/thinking";
import { CUSTOM_EVENTS } from "@/constants/events";

import type { ProjectConfig } from "@/config";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { BranchListResult } from "@/types/ipc";

export interface BuildSourcesParams {
  projects: Map<string, ProjectConfig>;
  /** Map of workspace ID to workspace metadata (keyed by metadata.id, not path) */
  workspaceMetadata: Map<string, FrontendWorkspaceMetadata>;
  selectedWorkspace: {
    projectPath: string;
    projectName: string;
    namedWorkspacePath: string;
    workspaceId: string;
  } | null;
  streamingModels?: Map<string, string>;
  // UI actions
  getThinkingLevel: (workspaceId: string) => ThinkingLevel;
  onSetThinkingLevel: (workspaceId: string, level: ThinkingLevel) => void;

  onOpenNewWorkspaceModal: (projectPath: string) => void;
  onCreateWorkspace: (
    projectPath: string,
    branchName: string,
    trunkBranch: string
  ) => Promise<void>;
  getBranchesForProject: (projectPath: string) => Promise<BranchListResult>;
  onSelectWorkspace: (sel: {
    projectPath: string;
    projectName: string;
    namedWorkspacePath: string;
    workspaceId: string;
  }) => void;
  onRemoveWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  onRenameWorkspace: (
    workspaceId: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string }>;
  onAddProject: () => void;
  onRemoveProject: (path: string) => void;
  onToggleSidebar: () => void;
  onNavigateWorkspace: (dir: "next" | "prev") => void;
  onOpenWorkspaceInTerminal: (workspaceId: string) => void;
}

const THINKING_LEVELS: ThinkingLevel[] = ["off", "low", "medium", "high"];

const section = {
  workspaces: "Workspaces",
  navigation: "Navigation",
  chat: "Chat",
  mode: "Modes & Model",
  help: "Help",
  projects: "Projects",
};

export function buildCoreSources(p: BuildSourcesParams): Array<() => CommandAction[]> {
  const actions: Array<() => CommandAction[]> = [];

  // NOTE: We intentionally just open the NewWorkspaceModal instead of implementing
  // an interactive prompt in the CommandPalette. This avoids duplicating UI logic
  // and ensures consistency - both `/new` command and the command palette use the
  // same modal for workspace creation.
  const createWorkspaceForSelectedProjectAction = (
    selected: NonNullable<BuildSourcesParams["selectedWorkspace"]>
  ): CommandAction => {
    return {
      id: "ws:new",
      title: "Create New Workspace…",
      subtitle: `for ${selected.projectName}`,
      section: section.workspaces,
      shortcutHint: formatKeybind(KEYBINDS.NEW_WORKSPACE),
      run: () => p.onOpenNewWorkspaceModal(selected.projectPath),
    };
  };

  // Workspaces
  actions.push(() => {
    const list: CommandAction[] = [];

    const selected = p.selectedWorkspace;
    if (selected) {
      list.push(createWorkspaceForSelectedProjectAction(selected));
    }

    // Switch to workspace
    // Iterate through all workspace metadata (now keyed by workspace ID)
    for (const meta of p.workspaceMetadata.values()) {
      const isCurrent = selected?.workspaceId === meta.id;
      const isStreaming = p.streamingModels?.has(meta.id) ?? false;
      list.push({
        id: `ws:switch:${meta.id}`,
        title: `${isCurrent ? "• " : ""}Switch to ${meta.title ?? meta.id}`,
        subtitle: `${meta.projectName}${isStreaming ? " • streaming" : ""}`,
        section: section.workspaces,
        keywords: [meta.title ?? meta.id, meta.projectName, meta.namedWorkspacePath],
        run: () =>
          p.onSelectWorkspace({
            projectPath: meta.projectPath,
            projectName: meta.projectName,
            namedWorkspacePath: meta.namedWorkspacePath,
            workspaceId: meta.id,
          }),
      });
    }

    // Remove current workspace (rename action intentionally omitted until we add a proper modal)
    if (selected?.namedWorkspacePath) {
      const pathParts = selected.namedWorkspacePath.split("/");
      const workspaceName = pathParts[pathParts.length - 1] ?? selected.namedWorkspacePath;
      const workspaceDisplayName = `${selected.projectName}/${workspaceName}`;
      list.push({
        id: "ws:open-terminal-current",
        title: "Open Current Workspace in Terminal",
        subtitle: workspaceDisplayName,
        section: section.workspaces,
        shortcutHint: formatKeybind(KEYBINDS.OPEN_TERMINAL),
        run: () => {
          p.onOpenWorkspaceInTerminal(selected.workspaceId);
        },
      });
      list.push({
        id: "ws:remove",
        title: "Remove Current Workspace…",
        subtitle: workspaceDisplayName,
        section: section.workspaces,
        run: async () => {
          const ok = confirm("Remove current workspace? This cannot be undone.");
          if (ok) await p.onRemoveWorkspace(selected.workspaceId);
        },
      });
      list.push({
        id: "ws:rename",
        title: "Rename Current Workspace…",
        subtitle: workspaceDisplayName,
        section: section.workspaces,
        run: () => undefined,
        prompt: {
          title: "Rename Workspace",
          fields: [
            {
              type: "text",
              name: "newName",
              label: "New name",
              placeholder: "Enter new workspace name",
              // Use workspace metadata name (not path) for initial value
              initialValue: p.workspaceMetadata.get(selected.workspaceId)?.title ?? "",
              getInitialValue: () => p.workspaceMetadata.get(selected.workspaceId)?.title ?? "",
              validate: (v) => (!v.trim() ? "Name is required" : null),
            },
          ],
          onSubmit: async (vals) => {
            await p.onRenameWorkspace(selected.workspaceId, vals.newName.trim());
          },
        },
      });
    }

    if (p.workspaceMetadata.size > 0) {
      list.push({
        id: "ws:open-terminal",
        title: "Open Workspace in Terminal…",
        section: section.workspaces,
        run: () => undefined,
        prompt: {
          title: "Open Workspace in Terminal",
          fields: [
            {
              type: "select",
              name: "workspaceId",
              label: "Workspace",
              placeholder: "Search workspaces…",
              getOptions: () =>
                Array.from(p.workspaceMetadata.values()).map((meta) => {
                  // Use workspace name instead of extracting from path
                  const label = `${meta.projectName} / ${meta.title ?? meta.id}`;
                  return {
                    id: meta.id,
                    label,
                    keywords: [
                      meta.title ?? meta.id,
                      meta.projectName,
                      meta.namedWorkspacePath,
                      meta.id,
                    ],
                  };
                }),
            },
          ],
          onSubmit: (vals) => {
            p.onOpenWorkspaceInTerminal(vals.workspaceId);
          },
        },
      });
      list.push({
        id: "ws:rename-any",
        title: "Rename Workspace…",
        section: section.workspaces,
        run: () => undefined,
        prompt: {
          title: "Rename Workspace",
          fields: [
            {
              type: "select",
              name: "workspaceId",
              label: "Select workspace",
              placeholder: "Search workspaces…",
              getOptions: () =>
                Array.from(p.workspaceMetadata.values()).map((meta) => {
                  const label = `${meta.projectName} / ${meta.title ?? meta.id}`;
                  return {
                    id: meta.id,
                    label,
                    keywords: [
                      meta.title ?? meta.id,
                      meta.projectName,
                      meta.namedWorkspacePath,
                      meta.id,
                    ],
                  };
                }),
            },
            {
              type: "text",
              name: "newName",
              label: "New name",
              placeholder: "Enter new workspace name",
              getInitialValue: (values) => {
                const meta = Array.from(p.workspaceMetadata.values()).find(
                  (m) => m.id === values.workspaceId
                );
                return meta ? (meta.title ?? meta.id) : "";
              },
              validate: (v) => (!v.trim() ? "Name is required" : null),
            },
          ],
          onSubmit: async (vals) => {
            await p.onRenameWorkspace(vals.workspaceId, vals.newName.trim());
          },
        },
      });
      list.push({
        id: "ws:remove-any",
        title: "Remove Workspace…",
        section: section.workspaces,
        run: () => undefined,
        prompt: {
          title: "Remove Workspace",
          fields: [
            {
              type: "select",
              name: "workspaceId",
              label: "Select workspace",
              placeholder: "Search workspaces…",
              getOptions: () =>
                Array.from(p.workspaceMetadata.values()).map((meta) => {
                  const label = `${meta.projectName}/${meta.title ?? meta.id}`;
                  return {
                    id: meta.id,
                    label,
                    keywords: [
                      meta.title ?? meta.id,
                      meta.projectName,
                      meta.namedWorkspacePath,
                      meta.id,
                    ],
                  };
                }),
            },
          ],
          onSubmit: async (vals) => {
            const meta = Array.from(p.workspaceMetadata.values()).find(
              (m) => m.id === vals.workspaceId
            );
            const workspaceName = meta
              ? `${meta.projectName}/${meta.title ?? meta.id}`
              : vals.workspaceId;
            const ok = confirm(`Remove workspace ${workspaceName}? This cannot be undone.`);
            if (ok) {
              await p.onRemoveWorkspace(vals.workspaceId);
            }
          },
        },
      });
    }

    return list;
  });

  // Navigation / Interface
  actions.push(() => [
    {
      id: "nav:next",
      title: "Next Workspace",
      section: section.navigation,
      shortcutHint: formatKeybind(KEYBINDS.NEXT_WORKSPACE),
      run: () => p.onNavigateWorkspace("next"),
    },
    {
      id: "nav:prev",
      title: "Previous Workspace",
      section: section.navigation,
      shortcutHint: formatKeybind(KEYBINDS.PREV_WORKSPACE),
      run: () => p.onNavigateWorkspace("prev"),
    },
    {
      id: "nav:toggleSidebar",
      title: "Toggle Sidebar",
      section: section.navigation,
      shortcutHint: formatKeybind(KEYBINDS.TOGGLE_SIDEBAR),
      run: () => p.onToggleSidebar(),
    },
  ]);

  // Chat utilities
  actions.push(() => {
    const list: CommandAction[] = [];
    if (p.selectedWorkspace) {
      const id = p.selectedWorkspace.workspaceId;
      list.push({
        id: "chat:clear",
        title: "Clear History",
        section: section.chat,
        run: async () => {
          await window.api.workspace.truncateHistory(id, 1.0);
        },
      });
      for (const pct of [0.75, 0.5, 0.25]) {
        list.push({
          id: `chat:truncate:${pct}`,
          title: `Truncate History to ${Math.round((1 - pct) * 100)}%`,
          section: section.chat,
          run: async () => {
            await window.api.workspace.truncateHistory(id, pct);
          },
        });
      }
      list.push({
        id: "chat:interrupt",
        title: "Interrupt Streaming",
        section: section.chat,
        run: async () => {
          await window.api.workspace.interruptStream(id);
        },
      });
      list.push({
        id: "chat:jumpBottom",
        title: "Jump to Bottom",
        section: section.chat,
        shortcutHint: formatKeybind(KEYBINDS.JUMP_TO_BOTTOM),
        run: () => {
          // Dispatch the keybind; AIView listens for it
          const ev = new KeyboardEvent("keydown", { key: "G", shiftKey: true });
          window.dispatchEvent(ev);
        },
      });
    }
    return list;
  });

  // Modes & Model
  actions.push(() => {
    const list: CommandAction[] = [
      {
        id: "mode:toggle",
        title: "Toggle Plan/Exec Mode",
        section: section.mode,
        shortcutHint: formatKeybind(KEYBINDS.TOGGLE_MODE),
        run: () => {
          const ev = new KeyboardEvent("keydown", { key: "M", ctrlKey: true, shiftKey: true });
          window.dispatchEvent(ev);
        },
      },
      {
        id: "model:change",
        title: "Change Model…",
        section: section.mode,
        shortcutHint: formatKeybind(KEYBINDS.OPEN_MODEL_SELECTOR),
        run: () => {
          window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.OPEN_MODEL_SELECTOR));
        },
      },
    ];

    const selectedWorkspace = p.selectedWorkspace;
    if (selectedWorkspace) {
      const { workspaceId } = selectedWorkspace;
      const levelDescriptions: Record<ThinkingLevel, string> = {
        off: "Off — fastest responses",
        low: "Low — add a bit of reasoning",
        medium: "Medium — balanced reasoning",
        high: "High — maximum reasoning depth",
      };
      const currentLevel = p.getThinkingLevel(workspaceId);

      list.push({
        id: "thinking:set-level",
        title: "Set Thinking Effort…",
        subtitle: `Current: ${levelDescriptions[currentLevel] ?? currentLevel}`,
        section: section.mode,
        run: () => undefined,
        prompt: {
          title: "Select Thinking Effort",
          fields: [
            {
              type: "select",
              name: "thinkingLevel",
              label: "Thinking effort",
              placeholder: "Choose effort level…",
              getOptions: () =>
                THINKING_LEVELS.map((level) => ({
                  id: level,
                  label: levelDescriptions[level],
                  keywords: [
                    level,
                    levelDescriptions[level].toLowerCase(),
                    "thinking",
                    "reasoning",
                  ],
                })),
            },
          ],
          onSubmit: (vals) => {
            const rawLevel = vals.thinkingLevel;
            const level = THINKING_LEVELS.includes(rawLevel as ThinkingLevel)
              ? (rawLevel as ThinkingLevel)
              : "off";
            p.onSetThinkingLevel(workspaceId, level);
          },
        },
      });
    }

    return list;
  });

  // Help / Docs
  actions.push(() => [
    {
      id: "help:keybinds",
      title: "Show Keyboard Shortcuts",
      section: section.help,
      run: () => {
        try {
          window.open("https://cmux.io/keybinds.html", "_blank");
        } catch {
          /* ignore */
        }
      },
    },
  ]);

  // Projects
  actions.push(() => {
    const branchCache = new Map<string, BranchListResult>();
    const getBranchInfoForProject = async (projectPath: string) => {
      const cached = branchCache.get(projectPath);
      if (cached) return cached;
      const info = await p.getBranchesForProject(projectPath);
      branchCache.set(projectPath, info);
      return info;
    };

    const list: CommandAction[] = [
      {
        id: "project:add",
        title: "Add Project…",
        section: section.projects,
        run: () => p.onAddProject(),
      },
      {
        id: "ws:new-in-project",
        title: "Create New Workspace in Project…",
        section: section.projects,
        run: () => undefined,
        prompt: {
          title: "New Workspace in Project",
          fields: [
            {
              type: "select",
              name: "projectPath",
              label: "Select project",
              placeholder: "Search projects…",
              getOptions: (_values) =>
                Array.from(p.projects.keys()).map((projectPath) => ({
                  id: projectPath,
                  label: projectPath.split("/").pop() ?? projectPath,
                  keywords: [projectPath],
                })),
            },
            {
              type: "text",
              name: "branchName",
              label: "Workspace branch name",
              placeholder: "Enter branch name",
              validate: (v) => (!v.trim() ? "Branch name is required" : null),
            },
            {
              type: "select",
              name: "trunkBranch",
              label: "Trunk branch",
              placeholder: "Search branches…",
              getOptions: async (values) => {
                if (!values.projectPath) return [];
                const info = await getBranchInfoForProject(values.projectPath);
                return info.branches.map((branch) => ({
                  id: branch,
                  label: branch,
                  keywords: [branch],
                }));
              },
            },
          ],
          onSubmit: async (vals) => {
            const projectPath = vals.projectPath;
            const trimmedBranchName = vals.branchName.trim();
            const info = await getBranchInfoForProject(projectPath);
            const providedTrunk = vals.trunkBranch?.trim();
            const resolvedTrunk =
              providedTrunk && info.branches.includes(providedTrunk)
                ? providedTrunk
                : info.branches.includes(info.recommendedTrunk)
                  ? info.recommendedTrunk
                  : info.branches[0];

            if (!resolvedTrunk) {
              throw new Error("Unable to determine trunk branch for workspace creation");
            }

            await p.onCreateWorkspace(projectPath, trimmedBranchName, resolvedTrunk);
          },
        },
      },
    ];

    for (const [projectPath] of p.projects.entries()) {
      const projectName = projectPath.split("/").pop() ?? projectPath;
      list.push({
        id: `project:remove:${projectPath}`,
        title: `Remove Project ${projectName}…`,
        section: section.projects,
        run: () => p.onRemoveProject(projectPath),
      });
    }
    return list;
  });

  return actions;
}

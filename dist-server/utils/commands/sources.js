"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCoreSources = buildCoreSources;
const keybinds_1 = require("../../utils/ui/keybinds");
const section = {
    workspaces: "Workspaces",
    navigation: "Navigation",
    chat: "Chat",
    mode: "Modes & Model",
    help: "Help",
    projects: "Projects",
};
function buildCoreSources(p) {
    const actions = [];
    // Workspaces
    actions.push(() => {
        const list = [];
        const selected = p.selectedWorkspace;
        if (selected) {
            list.push({
                id: "ws:new",
                title: "Create New Workspace…",
                subtitle: `for ${selected.projectName}`,
                section: section.workspaces,
                shortcutHint: (0, keybinds_1.formatKeybind)(keybinds_1.KEYBINDS.NEW_WORKSPACE),
                run: () => undefined,
                prompt: {
                    title: "New Workspace",
                    fields: [
                        {
                            type: "text",
                            name: "branchName",
                            label: "Branch name",
                            placeholder: "Enter branch name",
                            validate: (v) => (!v.trim() ? "Branch name is required" : null),
                        },
                    ],
                    onSubmit: async (vals) => {
                        await p.onCreateWorkspace(selected.projectPath, vals.branchName.trim());
                    },
                },
            });
        }
        // Switch to workspace
        for (const [projectPath, config] of p.projects.entries()) {
            const projectName = projectPath.split("/").pop() ?? projectPath;
            for (const ws of config.workspaces) {
                const meta = p.workspaceMetadata.get(ws.path);
                if (!meta)
                    continue;
                const isCurrent = selected?.workspaceId === meta.id;
                const isStreaming = p.streamingModels.has(meta.id);
                list.push({
                    id: `ws:switch:${meta.id}`,
                    title: `${isCurrent ? "• " : ""}Switch to ${ws.path.split("/").pop() ?? ws.path}`,
                    subtitle: `${projectName}${isStreaming ? " • streaming" : ""}`,
                    section: section.workspaces,
                    keywords: [projectName, ws.path],
                    run: () => p.onSelectWorkspace({
                        projectPath,
                        projectName,
                        workspacePath: ws.path,
                        workspaceId: meta.id,
                    }),
                });
            }
        }
        // Remove current workspace (rename action intentionally omitted until we add a proper modal)
        if (selected) {
            const workspaceDisplayName = `${selected.projectName}/${selected.workspacePath.split("/").pop() ?? selected.workspacePath}`;
            list.push({
                id: "ws:open-terminal-current",
                title: "Open Current Workspace in Terminal",
                subtitle: workspaceDisplayName,
                section: section.workspaces,
                shortcutHint: (0, keybinds_1.formatKeybind)(keybinds_1.KEYBINDS.OPEN_TERMINAL),
                run: () => {
                    p.onOpenWorkspaceInTerminal(selected.workspacePath);
                },
            });
            list.push({
                id: "ws:remove",
                title: "Remove Current Workspace…",
                subtitle: workspaceDisplayName,
                section: section.workspaces,
                run: async () => {
                    const ok = confirm("Remove current workspace? This cannot be undone.");
                    if (ok)
                        await p.onRemoveWorkspace(selected.workspaceId);
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
                            initialValue: selected.workspacePath.split("/").pop() ?? "",
                            getInitialValue: () => selected.workspacePath.split("/").pop() ?? "",
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
                            name: "workspacePath",
                            label: "Workspace",
                            placeholder: "Search workspaces…",
                            getOptions: () => Array.from(p.workspaceMetadata.values()).map((meta) => {
                                const workspaceName = meta.workspacePath.split("/").pop() ?? meta.workspacePath;
                                const label = `${meta.projectName} / ${workspaceName}`;
                                return {
                                    id: meta.workspacePath,
                                    label,
                                    keywords: [workspaceName, meta.projectName, meta.workspacePath, meta.id],
                                };
                            }),
                        },
                    ],
                    onSubmit: (vals) => {
                        p.onOpenWorkspaceInTerminal(vals.workspacePath);
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
                            getOptions: () => Array.from(p.workspaceMetadata.values()).map((meta) => {
                                const workspaceName = meta.workspacePath.split("/").pop() ?? meta.workspacePath;
                                const label = `${meta.projectName} / ${workspaceName}`;
                                return {
                                    id: meta.id,
                                    label,
                                    keywords: [workspaceName, meta.projectName, meta.workspacePath, meta.id],
                                };
                            }),
                        },
                        {
                            type: "text",
                            name: "newName",
                            label: "New name",
                            placeholder: "Enter new workspace name",
                            getInitialValue: (values) => {
                                const meta = Array.from(p.workspaceMetadata.values()).find((m) => m.id === values.workspaceId);
                                return meta ? (meta.workspacePath.split("/").pop() ?? "") : "";
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
                            getOptions: () => Array.from(p.workspaceMetadata.values()).map((meta) => {
                                const workspaceName = meta.workspacePath.split("/").pop() ?? meta.workspacePath;
                                const label = `${meta.projectName}/${workspaceName}`;
                                return {
                                    id: meta.id,
                                    label,
                                    keywords: [workspaceName, meta.projectName, meta.workspacePath, meta.id],
                                };
                            }),
                        },
                    ],
                    onSubmit: async (vals) => {
                        const meta = Array.from(p.workspaceMetadata.values()).find((m) => m.id === vals.workspaceId);
                        const workspaceName = meta
                            ? `${meta.projectName}/${meta.workspacePath.split("/").pop() ?? meta.workspacePath}`
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
            shortcutHint: (0, keybinds_1.formatKeybind)(keybinds_1.KEYBINDS.NEXT_WORKSPACE),
            run: () => p.onNavigateWorkspace("next"),
        },
        {
            id: "nav:prev",
            title: "Previous Workspace",
            section: section.navigation,
            shortcutHint: (0, keybinds_1.formatKeybind)(keybinds_1.KEYBINDS.PREV_WORKSPACE),
            run: () => p.onNavigateWorkspace("prev"),
        },
        {
            id: "nav:toggleSidebar",
            title: "Toggle Sidebar",
            section: section.navigation,
            shortcutHint: (0, keybinds_1.formatKeybind)(keybinds_1.KEYBINDS.TOGGLE_SIDEBAR),
            run: () => p.onToggleSidebar(),
        },
    ]);
    // Chat utilities
    actions.push(() => {
        const list = [];
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
                    await window.api.workspace.sendMessage(id, "");
                },
            });
            list.push({
                id: "chat:jumpBottom",
                title: "Jump to Bottom",
                section: section.chat,
                shortcutHint: (0, keybinds_1.formatKeybind)(keybinds_1.KEYBINDS.JUMP_TO_BOTTOM),
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
    actions.push(() => [
        {
            id: "mode:toggle",
            title: "Toggle Plan/Exec Mode",
            section: section.mode,
            shortcutHint: (0, keybinds_1.formatKeybind)(keybinds_1.KEYBINDS.TOGGLE_MODE),
            run: () => {
                const ev = new KeyboardEvent("keydown", { key: "M", ctrlKey: true, shiftKey: true });
                window.dispatchEvent(ev);
            },
        },
        {
            id: "model:change",
            title: "Change Model…",
            section: section.mode,
            shortcutHint: (0, keybinds_1.formatKeybind)(keybinds_1.KEYBINDS.OPEN_MODEL_SELECTOR),
            run: () => {
                window.dispatchEvent(new CustomEvent("cmux:openModelSelector"));
            },
        },
    ]);
    // Help / Docs
    actions.push(() => [
        {
            id: "help:keybinds",
            title: "Show Keyboard Shortcuts",
            section: section.help,
            run: () => {
                try {
                    window.open("https://cmux.io/keybinds.html", "_blank");
                }
                catch {
                    /* ignore */
                }
            },
        },
    ]);
    // Projects
    actions.push(() => {
        const list = [
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
                            getOptions: (_values) => Array.from(p.projects.keys()).map((projectPath) => ({
                                id: projectPath,
                                label: projectPath.split("/").pop() ?? projectPath,
                                keywords: [projectPath],
                            })),
                        },
                        {
                            type: "text",
                            name: "branchName",
                            label: "Branch name",
                            placeholder: "Enter branch name",
                            validate: (v) => (!v.trim() ? "Branch name is required" : null),
                        },
                    ],
                    onSubmit: async (vals) => {
                        await p.onCreateWorkspace(vals.projectPath, vals.branchName.trim());
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
//# sourceMappingURL=sources.js.map
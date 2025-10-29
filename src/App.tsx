import { useEffect, useCallback, useRef } from "react";
import "./styles/globals.css";
import { useApp } from "./contexts/AppContext";
import type { WorkspaceSelection } from "./components/ProjectSidebar";
import type { FrontendWorkspaceMetadata } from "./types/workspace";
import { LeftSidebar } from "./components/LeftSidebar";
import NewWorkspaceModal from "./components/NewWorkspaceModal";
import { DirectorySelectModal } from "./components/DirectorySelectModal";
import { AIView } from "./components/AIView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { usePersistedState, updatePersistedState } from "./hooks/usePersistedState";
import { matchesKeybind, KEYBINDS } from "./utils/ui/keybinds";
import { useResumeManager } from "./hooks/useResumeManager";
import { useUnreadTracking } from "./hooks/useUnreadTracking";
import { useAutoCompactContinue } from "./hooks/useAutoCompactContinue";
import { useWorkspaceStoreRaw, useWorkspaceRecency } from "./stores/WorkspaceStore";

import { useStableReference, compareMaps } from "./hooks/useStableReference";
import { CommandRegistryProvider, useCommandRegistry } from "./contexts/CommandRegistryContext";
import type { CommandAction } from "./contexts/CommandRegistryContext";
import { CommandPalette } from "./components/CommandPalette";
import { buildCoreSources, type BuildSourcesParams } from "./utils/commands/sources";

import type { ThinkingLevel } from "./types/thinking";
import { CUSTOM_EVENTS } from "./constants/events";
import { isWorkspaceForkSwitchEvent } from "./utils/workspaceFork";
import { getThinkingLevelKey } from "./constants/storage";
import type { BranchListResult } from "./types/ipc";
import { useTelemetry } from "./hooks/useTelemetry";
import { useWorkspaceModal } from "./hooks/useWorkspaceModal";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "low", "medium", "high"];

function AppInner() {
  // Get app-level state from context
  const {
    projects,
    addProject,
    removeProject,
    workspaceMetadata,
    setWorkspaceMetadata,
    createWorkspace,
    removeWorkspace,
    renameWorkspace,
    selectedWorkspace,
    setSelectedWorkspace,
  } = useApp();

  // Auto-collapse sidebar on mobile by default
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("sidebarCollapsed", isMobile);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, [setSidebarCollapsed]);

  // Telemetry tracking
  const telemetry = useTelemetry();

  // Get workspace store for command palette
  const workspaceStore = useWorkspaceStoreRaw();

  // Workspace modal management
  const workspaceModal = useWorkspaceModal({
    createWorkspace,
    setSelectedWorkspace,
    telemetry,
  });

  // Wrapper for setSelectedWorkspace that tracks telemetry
  const handleWorkspaceSwitch = useCallback(
    (newWorkspace: WorkspaceSelection | null) => {
      // Track workspace switch when both old and new are non-null (actual switch, not init/clear)
      if (
        selectedWorkspace &&
        newWorkspace &&
        selectedWorkspace.workspaceId !== newWorkspace.workspaceId
      ) {
        telemetry.workspaceSwitched(selectedWorkspace.workspaceId, newWorkspace.workspaceId);
      }

      setSelectedWorkspace(newWorkspace);
    },
    [selectedWorkspace, setSelectedWorkspace, telemetry]
  );

  // Validate selectedWorkspace when metadata changes
  // Clear selection if workspace was deleted
  useEffect(() => {
    if (selectedWorkspace && !workspaceMetadata.has(selectedWorkspace.workspaceId)) {
      setSelectedWorkspace(null);
    }
  }, [selectedWorkspace, workspaceMetadata, setSelectedWorkspace]);

  // Track last-read timestamps for unread indicators
  const { lastReadTimestamps, onToggleUnread } = useUnreadTracking(selectedWorkspace);

  // Auto-resume interrupted streams on app startup and when failures occur
  useResumeManager();

  // Handle auto-continue after compaction (when user uses /compact -c)
  useAutoCompactContinue();

  // Sync selectedWorkspace with URL hash
  useEffect(() => {
    if (selectedWorkspace) {
      // Update URL with workspace ID
      const newHash = `#workspace=${encodeURIComponent(selectedWorkspace.workspaceId)}`;
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, "", newHash);
      }

      // Update window title with workspace name
      const workspaceName =
        workspaceMetadata.get(selectedWorkspace.workspaceId)?.name ?? selectedWorkspace.workspaceId;
      const title = `${workspaceName} - ${selectedWorkspace.projectName} - cmux`;
      void window.api.window.setTitle(title);
    } else {
      // Clear hash when no workspace selected
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      void window.api.window.setTitle("cmux");
    }
  }, [selectedWorkspace, workspaceMetadata]);

  // Validate selected workspace exists and has all required fields
  useEffect(() => {
    if (selectedWorkspace) {
      const metadata = workspaceMetadata.get(selectedWorkspace.workspaceId);

      if (!metadata) {
        // Workspace was deleted
        console.warn(
          `Workspace ${selectedWorkspace.workspaceId} no longer exists, clearing selection`
        );
        setSelectedWorkspace(null);
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      } else if (!selectedWorkspace.namedWorkspacePath && metadata.namedWorkspacePath) {
        // Old localStorage entry missing namedWorkspacePath - update it once
        console.log(`Updating workspace ${selectedWorkspace.workspaceId} with missing fields`);
        setSelectedWorkspace({
          workspaceId: metadata.id,
          projectPath: metadata.projectPath,
          projectName: metadata.projectName,
          namedWorkspacePath: metadata.namedWorkspacePath,
        });
      }
    }
  }, [selectedWorkspace, workspaceMetadata, setSelectedWorkspace]);

  const openWorkspaceInTerminal = useCallback(
    (workspaceId: string) => {
      // Look up workspace metadata to get the workspace path (directory uses workspace name)
      const metadata = workspaceMetadata.get(workspaceId);
      if (metadata) {
        void window.api.workspace.openTerminal(metadata.namedWorkspacePath);
      }
    },
    [workspaceMetadata]
  );

  const handleRemoveProject = useCallback(
    async (path: string) => {
      if (selectedWorkspace?.projectPath === path) {
        setSelectedWorkspace(null);
      }
      await removeProject(path);
    },
    [removeProject, selectedWorkspace, setSelectedWorkspace]
  );

  const handleGetSecrets = useCallback(async (projectPath: string) => {
    return await window.api.projects.secrets.get(projectPath);
  }, []);

  const handleUpdateSecrets = useCallback(
    async (projectPath: string, secrets: Array<{ key: string; value: string }>) => {
      const result = await window.api.projects.secrets.update(projectPath, secrets);
      if (!result.success) {
        console.error("Failed to update secrets:", result.error);
      }
    },
    []
  );

  // NEW: Get workspace recency from store
  const workspaceRecency = useWorkspaceRecency();

  // Sort workspaces by recency (most recent first)
  // Returns Map<projectPath, FrontendWorkspaceMetadata[]> for direct component use
  // Use stable reference to prevent sidebar re-renders when sort order hasn't changed
  const sortedWorkspacesByProject = useStableReference(
    () => {
      const result = new Map<string, FrontendWorkspaceMetadata[]>();
      for (const [projectPath, config] of projects) {
        // Transform Workspace[] to FrontendWorkspaceMetadata[] using workspace ID
        const metadataList = config.workspaces
          .map((ws) => (ws.id ? workspaceMetadata.get(ws.id) : undefined))
          .filter((meta): meta is FrontendWorkspaceMetadata => meta !== undefined && meta !== null);

        // Sort by recency
        metadataList.sort((a, b) => {
          const aTimestamp = workspaceRecency[a.id] ?? 0;
          const bTimestamp = workspaceRecency[b.id] ?? 0;
          return bTimestamp - aTimestamp;
        });

        result.set(projectPath, metadataList);
      }
      return result;
    },
    (prev, next) => {
      // Compare Maps: check if size, workspace order, and metadata content are the same
      if (
        !compareMaps(prev, next, (a, b) => {
          if (a.length !== b.length) return false;
          // Check both ID and name to detect renames
          return a.every((metadata, i) => {
            const bMeta = b[i];
            if (!bMeta || !metadata) return false; // Null-safe
            return metadata.id === bMeta.id && metadata.name === bMeta.name;
          });
        })
      ) {
        return false;
      }
      return true;
    },
    [projects, workspaceMetadata, workspaceRecency]
  );

  const handleNavigateWorkspace = useCallback(
    (direction: "next" | "prev") => {
      if (!selectedWorkspace) return;

      // Use sorted workspaces to match visual order in sidebar
      const sortedWorkspaces = sortedWorkspacesByProject.get(selectedWorkspace.projectPath);
      if (!sortedWorkspaces || sortedWorkspaces.length <= 1) return;

      // Find current workspace index in sorted list
      const currentIndex = sortedWorkspaces.findIndex(
        (metadata) => metadata.id === selectedWorkspace.workspaceId
      );
      if (currentIndex === -1) return;

      // Calculate next/prev index with wrapping
      let targetIndex: number;
      if (direction === "next") {
        targetIndex = (currentIndex + 1) % sortedWorkspaces.length;
      } else {
        targetIndex = currentIndex === 0 ? sortedWorkspaces.length - 1 : currentIndex - 1;
      }

      const targetMetadata = sortedWorkspaces[targetIndex];
      if (!targetMetadata) return;

      setSelectedWorkspace({
        projectPath: selectedWorkspace.projectPath,
        projectName: selectedWorkspace.projectName,
        namedWorkspacePath: targetMetadata.namedWorkspacePath,
        workspaceId: targetMetadata.id,
      });
    },
    [selectedWorkspace, sortedWorkspacesByProject, setSelectedWorkspace]
  );

  // Register command sources with registry
  const {
    registerSource,
    isOpen: isCommandPaletteOpen,
    open: openCommandPalette,
    close: closeCommandPalette,
  } = useCommandRegistry();

  const getThinkingLevelForWorkspace = useCallback((workspaceId: string): ThinkingLevel => {
    if (!workspaceId) {
      return "off";
    }

    if (typeof window === "undefined" || !window.localStorage) {
      return "off";
    }

    try {
      const key = getThinkingLevelKey(workspaceId);
      const stored = window.localStorage.getItem(key);
      if (!stored || stored === "undefined") {
        return "off";
      }
      const parsed = JSON.parse(stored) as ThinkingLevel;
      return THINKING_LEVELS.includes(parsed) ? parsed : "off";
    } catch (error) {
      console.warn("Failed to read thinking level", error);
      return "off";
    }
  }, []);

  const setThinkingLevelFromPalette = useCallback((workspaceId: string, level: ThinkingLevel) => {
    if (!workspaceId) {
      return;
    }

    const normalized = THINKING_LEVELS.includes(level) ? level : "off";
    const key = getThinkingLevelKey(workspaceId);

    // Use the utility function which handles localStorage and event dispatch
    // ThinkingProvider will pick this up via its listener
    updatePersistedState(key, normalized);

    // Dispatch toast notification event for UI feedback
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(CUSTOM_EVENTS.THINKING_LEVEL_TOAST, {
          detail: { workspaceId, level: normalized },
        })
      );
    }
  }, []);

  const registerParamsRef = useRef<BuildSourcesParams>({} as BuildSourcesParams);

  const openNewWorkspaceFromPalette = useCallback(
    (projectPath: string) => {
      void workspaceModal.openModal(projectPath);
    },
    [workspaceModal]
  );

  const getBranchesForProject = useCallback(
    async (projectPath: string): Promise<BranchListResult> => {
      const branchResult = await window.api.projects.listBranches(projectPath);
      const sanitizedBranches = Array.isArray(branchResult?.branches)
        ? branchResult.branches.filter((branch): branch is string => typeof branch === "string")
        : [];

      const recommended =
        typeof branchResult?.recommendedTrunk === "string" &&
        sanitizedBranches.includes(branchResult.recommendedTrunk)
          ? branchResult.recommendedTrunk
          : (sanitizedBranches[0] ?? "");

      return {
        branches: sanitizedBranches,
        recommendedTrunk: recommended,
      };
    },
    []
  );

  const selectWorkspaceFromPalette = useCallback(
    (selection: WorkspaceSelection) => {
      handleWorkspaceSwitch(selection);
    },
    [handleWorkspaceSwitch]
  );

  const removeWorkspaceFromPalette = useCallback(
    async (workspaceId: string) => removeWorkspace(workspaceId),
    [removeWorkspace]
  );

  const renameWorkspaceFromPalette = useCallback(
    async (workspaceId: string, newName: string) => renameWorkspace(workspaceId, newName),
    [renameWorkspace]
  );

  const addProjectFromPalette = useCallback(() => {
    void addProject();
  }, [addProject]);

  const removeProjectFromPalette = useCallback(
    (path: string) => {
      void handleRemoveProject(path);
    },
    [handleRemoveProject]
  );

  const toggleSidebarFromPalette = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, [setSidebarCollapsed]);

  const navigateWorkspaceFromPalette = useCallback(
    (dir: "next" | "prev") => {
      handleNavigateWorkspace(dir);
    },
    [handleNavigateWorkspace]
  );

  registerParamsRef.current = {
    projects,
    workspaceMetadata,
    selectedWorkspace,
    getThinkingLevel: getThinkingLevelForWorkspace,
    onSetThinkingLevel: setThinkingLevelFromPalette,
    onOpenNewWorkspaceModal: openNewWorkspaceFromPalette,
    getBranchesForProject,
    onSelectWorkspace: selectWorkspaceFromPalette,
    onRemoveWorkspace: removeWorkspaceFromPalette,
    onRenameWorkspace: renameWorkspaceFromPalette,
    onAddProject: addProjectFromPalette,
    onRemoveProject: removeProjectFromPalette,
    onToggleSidebar: toggleSidebarFromPalette,
    onNavigateWorkspace: navigateWorkspaceFromPalette,
    onOpenWorkspaceInTerminal: openWorkspaceInTerminal,
  };

  useEffect(() => {
    const unregister = registerSource(() => {
      const params: BuildSourcesParams = registerParamsRef.current;

      // Compute streaming models here (only when command palette opens)
      const allStates = workspaceStore.getAllStates();
      const streamingModels = new Map<string, string>();
      for (const [workspaceId, state] of allStates) {
        if (state.canInterrupt && state.currentModel) {
          streamingModels.set(workspaceId, state.currentModel);
        }
      }

      const factories = buildCoreSources({ ...params, streamingModels });
      const actions: CommandAction[] = [];
      for (const factory of factories) {
        actions.push(...factory());
      }
      return actions;
    });
    return unregister;
  }, [registerSource, workspaceStore]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesKeybind(e, KEYBINDS.NEXT_WORKSPACE)) {
        e.preventDefault();
        handleNavigateWorkspace("next");
      } else if (matchesKeybind(e, KEYBINDS.PREV_WORKSPACE)) {
        e.preventDefault();
        handleNavigateWorkspace("prev");
      } else if (matchesKeybind(e, KEYBINDS.OPEN_COMMAND_PALETTE)) {
        e.preventDefault();
        if (isCommandPaletteOpen) {
          closeCommandPalette();
        } else {
          openCommandPalette();
        }
      } else if (matchesKeybind(e, KEYBINDS.TOGGLE_SIDEBAR)) {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleNavigateWorkspace,
    setSidebarCollapsed,
    isCommandPaletteOpen,
    closeCommandPalette,
    openCommandPalette,
  ]);

  // Handle workspace fork switch event
  useEffect(() => {
    const handleForkSwitch = (e: Event) => {
      if (!isWorkspaceForkSwitchEvent(e)) return;

      const workspaceInfo = e.detail;

      // Find the project in config
      const project = projects.get(workspaceInfo.projectPath);
      if (!project) {
        console.error(`Project not found for path: ${workspaceInfo.projectPath}`);
        return;
      }

      // DEFENSIVE: Ensure createdAt exists
      if (!workspaceInfo.createdAt) {
        console.warn(
          `[Frontend] Workspace ${workspaceInfo.id} missing createdAt in fork switch - using default (2025-01-01)`
        );
        workspaceInfo.createdAt = "2025-01-01T00:00:00.000Z";
      }

      // Update metadata Map immediately (don't wait for async metadata event)
      // This ensures the title bar effect has the workspace name available
      setWorkspaceMetadata((prev) => {
        const updated = new Map(prev);
        updated.set(workspaceInfo.id, workspaceInfo);
        return updated;
      });

      // Switch to the new workspace
      setSelectedWorkspace({
        workspaceId: workspaceInfo.id,
        projectPath: workspaceInfo.projectPath,
        projectName: workspaceInfo.projectName,
        namedWorkspacePath: workspaceInfo.namedWorkspacePath,
      });
    };

    window.addEventListener(CUSTOM_EVENTS.WORKSPACE_FORK_SWITCH, handleForkSwitch as EventListener);
    return () =>
      window.removeEventListener(
        CUSTOM_EVENTS.WORKSPACE_FORK_SWITCH,
        handleForkSwitch as EventListener
      );
  }, [projects, setSelectedWorkspace, setWorkspaceMetadata]);

  // Handle open new workspace modal event
  useEffect(() => {
    const handleOpenNewWorkspaceModal = (e: Event) => {
      const customEvent = e as CustomEvent<{
        projectPath: string;
        startMessage?: string;
        model?: string;
        error?: string;
      }>;
      const { projectPath, startMessage, model, error } = customEvent.detail;
      void workspaceModal.openModal(projectPath, { startMessage, model, error });
    };

    window.addEventListener(
      CUSTOM_EVENTS.OPEN_NEW_WORKSPACE_MODAL,
      handleOpenNewWorkspaceModal as EventListener
    );
    return () =>
      window.removeEventListener(
        CUSTOM_EVENTS.OPEN_NEW_WORKSPACE_MODAL,
        handleOpenNewWorkspaceModal as EventListener
      );
  }, [workspaceModal]);

  return (
    <>
      <div className="bg-bg-dark flex h-screen overflow-hidden [@media(max-width:768px)]:flex-col">
        <LeftSidebar
          onSelectWorkspace={handleWorkspaceSwitch}
          onAddProject={() => void addProject()}
          onAddWorkspace={(path) => void workspaceModal.openModal(path)}
          onRemoveProject={(path) => void handleRemoveProject(path)}
          lastReadTimestamps={lastReadTimestamps}
          onToggleUnread={onToggleUnread}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleSidebar}
          onGetSecrets={handleGetSecrets}
          onUpdateSecrets={handleUpdateSecrets}
          sortedWorkspacesByProject={sortedWorkspacesByProject}
          workspaceRecency={workspaceRecency}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden [@media(max-width:768px)]:w-full">
          <div className="flex flex-1 overflow-hidden [@media(max-width:768px)]:flex-col">
            {selectedWorkspace ? (
              <ErrorBoundary
                workspaceInfo={`${selectedWorkspace.projectName}/${selectedWorkspace.namedWorkspacePath?.split("/").pop() ?? selectedWorkspace.workspaceId}`}
              >
                <AIView
                  key={selectedWorkspace.workspaceId}
                  workspaceId={selectedWorkspace.workspaceId}
                  projectName={selectedWorkspace.projectName}
                  branch={
                    selectedWorkspace.namedWorkspacePath?.split("/").pop() ??
                    selectedWorkspace.workspaceId
                  }
                  namedWorkspacePath={selectedWorkspace.namedWorkspacePath ?? ""}
                  runtimeConfig={
                    workspaceMetadata.get(selectedWorkspace.workspaceId)?.runtimeConfig
                  }
                />
              </ErrorBoundary>
            ) : (
              <div
                className="[&_p]:text-muted mx-auto w-full max-w-3xl text-center [&_h2]:mb-4 [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-white [&_p]:leading-[1.6]"
                style={{
                  padding: "clamp(40px, 10vh, 100px) 20px",
                  fontSize: "clamp(14px, 2vw, 16px)",
                }}
              >
                <h2 style={{ fontSize: "clamp(24px, 5vw, 36px)", letterSpacing: "-1px" }}>
                  Welcome to Cmux
                </h2>
                <p>Select a workspace from the sidebar or add a new one to get started.</p>
              </div>
            )}
          </div>
        </div>
        <CommandPalette
          getSlashContext={() => ({
            providerNames: [],
            workspaceId: selectedWorkspace?.workspaceId,
          })}
        />
        {workspaceModal.state.isOpen && workspaceModal.state.projectPath && (
          <NewWorkspaceModal
            isOpen={workspaceModal.state.isOpen}
            projectName={workspaceModal.state.projectName}
            projectPath={workspaceModal.state.projectPath}
            branches={workspaceModal.state.branches}
            defaultTrunkBranch={workspaceModal.state.defaultTrunk}
            loadErrorMessage={workspaceModal.state.loadError}
            initialStartMessage={workspaceModal.state.startMessage}
            initialModel={workspaceModal.state.model}
            onClose={workspaceModal.closeModal}
            onAdd={workspaceModal.handleCreate}
          />
        )}
        <DirectorySelectModal />
      </div>
    </>
  );
}

function App() {
  return (
    <CommandRegistryProvider>
      <AppInner />
    </CommandRegistryProvider>
  );
}

export default App;

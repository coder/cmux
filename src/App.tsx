import { useState, useEffect, useCallback, useRef } from "react";
import "./styles/globals.css";
import type { ProjectConfig } from "./config";
import type { WorkspaceSelection } from "./components/ProjectSidebar";
import type { FrontendWorkspaceMetadata } from "./types/workspace";
import { LeftSidebar } from "./components/LeftSidebar";
import NewWorkspaceModal from "./components/NewWorkspaceModal";
import { DirectorySelectModal } from "./components/DirectorySelectModal";
import { AIView } from "./components/AIView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { usePersistedState, updatePersistedState } from "./hooks/usePersistedState";
import { matchesKeybind, KEYBINDS } from "./utils/ui/keybinds";
import { useProjectManagement } from "./hooks/useProjectManagement";
import { useWorkspaceManagement } from "./hooks/useWorkspaceManagement";
import { useResumeManager } from "./hooks/useResumeManager";
import { useUnreadTracking } from "./hooks/useUnreadTracking";
import { useAutoCompactContinue } from "./hooks/useAutoCompactContinue";
import { useWorkspaceStoreRaw, useWorkspaceRecency } from "./stores/WorkspaceStore";
import { useGitStatusStoreRaw } from "./stores/GitStatusStore";

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

const THINKING_LEVELS: ThinkingLevel[] = ["off", "low", "medium", "high"];

function AppInner() {
  const [selectedWorkspace, setSelectedWorkspace] = usePersistedState<WorkspaceSelection | null>(
    "selectedWorkspace",
    null
  );
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceModalProject, setWorkspaceModalProject] = useState<string | null>(null);
  const [workspaceModalProjectName, setWorkspaceModalProjectName] = useState<string>("");
  const [workspaceModalBranches, setWorkspaceModalBranches] = useState<string[]>([]);
  const [workspaceModalDefaultTrunk, setWorkspaceModalDefaultTrunk] = useState<string | undefined>(
    undefined
  );
  const [workspaceModalLoadError, setWorkspaceModalLoadError] = useState<string | null>(null);
  const workspaceModalProjectRef = useRef<string | null>(null);

  // Auto-collapse sidebar on mobile by default
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("sidebarCollapsed", isMobile);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, [setSidebarCollapsed]);

  // Telemetry tracking
  const telemetry = useTelemetry();

  // Wrapper for setSelectedWorkspace that tracks telemetry
  const handleWorkspaceSwitch = useCallback(
    (newWorkspace: WorkspaceSelection | null) => {
      console.debug("[App] handleWorkspaceSwitch called", {
        from: selectedWorkspace?.workspaceId,
        to: newWorkspace?.workspaceId,
      });

      // Track workspace switch when both old and new are non-null (actual switch, not init/clear)
      if (
        selectedWorkspace &&
        newWorkspace &&
        selectedWorkspace.workspaceId !== newWorkspace.workspaceId
      ) {
        console.debug("[App] Calling telemetry.workspaceSwitched");
        telemetry.workspaceSwitched(selectedWorkspace.workspaceId, newWorkspace.workspaceId);
      }
      setSelectedWorkspace(newWorkspace);
    },
    [selectedWorkspace, setSelectedWorkspace, telemetry]
  );

  // Use custom hooks for project and workspace management
  const { projects, setProjects, addProject, removeProject } = useProjectManagement();

  // Workspace management needs to update projects state when workspace operations complete
  const handleProjectsUpdate = useCallback(
    (newProjects: Map<string, ProjectConfig>) => {
      setProjects(newProjects);
    },
    [setProjects]
  );

  const {
    workspaceMetadata,
    setWorkspaceMetadata,
    loading: metadataLoading,
    createWorkspace,
    removeWorkspace,
    renameWorkspace,
  } = useWorkspaceManagement({
    selectedWorkspace,
    onProjectsUpdate: handleProjectsUpdate,
    onSelectedWorkspaceUpdate: setSelectedWorkspace,
  });

  // NEW: Sync workspace metadata with the stores
  const workspaceStore = useWorkspaceStoreRaw();
  const gitStatusStore = useGitStatusStoreRaw();

  useEffect(() => {
    // Only sync when metadata has actually loaded (not empty initial state)
    if (workspaceMetadata.size > 0) {
      workspaceStore.syncWorkspaces(workspaceMetadata);
    }
  }, [workspaceMetadata, workspaceStore]);

  useEffect(() => {
    // Only sync when metadata has actually loaded (not empty initial state)
    if (workspaceMetadata.size > 0) {
      gitStatusStore.syncWorkspaces(workspaceMetadata);
    }
  }, [workspaceMetadata, gitStatusStore]);

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

  // Restore workspace from URL on mount (if valid)
  // This effect runs once on mount to restore from hash, which takes priority over localStorage
  const [hasRestoredFromHash, setHasRestoredFromHash] = useState(false);

  useEffect(() => {
    // Only run once
    if (hasRestoredFromHash) return;

    // Wait for metadata to finish loading
    if (metadataLoading) return;

    const hash = window.location.hash;
    if (hash.startsWith("#workspace=")) {
      const workspaceId = decodeURIComponent(hash.substring("#workspace=".length));

      // Find workspace in metadata
      const metadata = workspaceMetadata.get(workspaceId);

      if (metadata) {
        // Restore from hash (overrides localStorage)
        setSelectedWorkspace({
          workspaceId: metadata.id,
          projectPath: metadata.projectPath,
          projectName: metadata.projectName,
          namedWorkspacePath: metadata.namedWorkspacePath,
        });
      }
    }

    setHasRestoredFromHash(true);
  }, [metadataLoading, workspaceMetadata, hasRestoredFromHash, setSelectedWorkspace]);

  // Validate selected workspace exists and has all required fields
  useEffect(() => {
    // Don't validate until metadata is loaded
    if (metadataLoading) return;

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
  }, [metadataLoading, selectedWorkspace, workspaceMetadata, setSelectedWorkspace]);

  const openWorkspaceInTerminal = useCallback(
    (workspaceId: string) => {
      // Look up workspace metadata to get the named path (user-friendly symlink)
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

  const handleAddWorkspace = useCallback(async (projectPath: string) => {
    const projectName = projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "project";

    workspaceModalProjectRef.current = projectPath;
    setWorkspaceModalProject(projectPath);
    setWorkspaceModalProjectName(projectName);
    setWorkspaceModalBranches([]);
    setWorkspaceModalDefaultTrunk(undefined);
    setWorkspaceModalLoadError(null);
    setWorkspaceModalOpen(true);

    try {
      const branchResult = await window.api.projects.listBranches(projectPath);

      // Guard against race condition: only update state if this is still the active project
      if (workspaceModalProjectRef.current !== projectPath) {
        return;
      }

      const sanitizedBranches = Array.isArray(branchResult?.branches)
        ? branchResult.branches.filter((branch): branch is string => typeof branch === "string")
        : [];

      const recommended =
        typeof branchResult?.recommendedTrunk === "string" &&
        sanitizedBranches.includes(branchResult.recommendedTrunk)
          ? branchResult.recommendedTrunk
          : sanitizedBranches[0];

      setWorkspaceModalBranches(sanitizedBranches);
      setWorkspaceModalDefaultTrunk(recommended);
      setWorkspaceModalLoadError(null);
    } catch (err) {
      console.error("Failed to load branches for modal:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      setWorkspaceModalLoadError(
        `Unable to load branches automatically: ${message}. You can still enter the trunk branch manually.`
      );
    }
  }, []);

  // Memoize callbacks to prevent LeftSidebar/ProjectSidebar re-renders
  const handleAddProjectCallback = useCallback(() => {
    void addProject();
  }, [addProject]);

  const handleAddWorkspaceCallback = useCallback(
    (projectPath: string) => {
      void handleAddWorkspace(projectPath);
    },
    [handleAddWorkspace]
  );

  const handleRemoveProjectCallback = useCallback(
    (path: string) => {
      void handleRemoveProject(path);
    },
    [handleRemoveProject]
  );

  const handleCreateWorkspace = async (branchName: string, trunkBranch: string) => {
    if (!workspaceModalProject) return;

    console.assert(
      typeof trunkBranch === "string" && trunkBranch.trim().length > 0,
      "Expected trunk branch to be provided by the workspace modal"
    );

    const newWorkspace = await createWorkspace(workspaceModalProject, branchName, trunkBranch);
    if (newWorkspace) {
      // Track workspace creation
      telemetry.workspaceCreated(newWorkspace.workspaceId);
      setSelectedWorkspace(newWorkspace);
    }
  };

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

  const registerParamsRef = useRef<BuildSourcesParams | null>(null);

  const openNewWorkspaceFromPalette = useCallback(
    (projectPath: string) => {
      void handleAddWorkspace(projectPath);
    },
    [handleAddWorkspace]
  );

  const createWorkspaceFromPalette = useCallback(
    async (projectPath: string, branchName: string, trunkBranch: string) => {
      console.assert(
        typeof trunkBranch === "string" && trunkBranch.trim().length > 0,
        "Expected trunk branch to be provided by the command palette"
      );
      const newWs = await createWorkspace(projectPath, branchName, trunkBranch);
      if (newWs) {
        telemetry.workspaceCreated(newWs.workspaceId);
        setSelectedWorkspace(newWs);
      }
    },
    [createWorkspace, setSelectedWorkspace, telemetry]
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
    onCreateWorkspace: createWorkspaceFromPalette,
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
      const params = registerParamsRef.current;
      if (!params) return [];

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

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-bg-dark [@media(max-width:768px)]:flex-col">
        <LeftSidebar
          projects={projects}
          workspaceMetadata={workspaceMetadata}
          selectedWorkspace={selectedWorkspace}
          onSelectWorkspace={handleWorkspaceSwitch}
          onAddProject={handleAddProjectCallback}
          onAddWorkspace={handleAddWorkspaceCallback}
          onRemoveProject={handleRemoveProjectCallback}
          onRemoveWorkspace={removeWorkspace}
          onRenameWorkspace={renameWorkspace}
          lastReadTimestamps={lastReadTimestamps}
          onToggleUnread={onToggleUnread}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleSidebar}
          onGetSecrets={handleGetSecrets}
          onUpdateSecrets={handleUpdateSecrets}
          sortedWorkspacesByProject={sortedWorkspacesByProject}
          workspaceRecency={workspaceRecency}
        />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 [@media(max-width:768px)]:w-full">
          <div className="flex-1 flex overflow-hidden [@media(max-width:768px)]:flex-col">
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
                />
              </ErrorBoundary>
            ) : (
              <div
                className="text-center max-w-3xl mx-auto w-full [&_h2]:text-white [&_h2]:mb-4 [&_h2]:font-bold [&_h2]:tracking-tight [&_p]:text-muted [&_p]:leading-[1.6]"
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
        {workspaceModalOpen && workspaceModalProject && (
          <NewWorkspaceModal
            isOpen={workspaceModalOpen}
            projectName={workspaceModalProjectName}
            branches={workspaceModalBranches}
            defaultTrunkBranch={workspaceModalDefaultTrunk}
            loadErrorMessage={workspaceModalLoadError}
            onClose={() => {
              workspaceModalProjectRef.current = null;
              setWorkspaceModalOpen(false);
              setWorkspaceModalProject(null);
              setWorkspaceModalProjectName("");
              setWorkspaceModalBranches([]);
              setWorkspaceModalDefaultTrunk(undefined);
              setWorkspaceModalLoadError(null);
            }}
            onAdd={handleCreateWorkspace}
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

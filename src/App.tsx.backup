import { useState, useEffect, useCallback, useRef } from "react";
import styled from "@emotion/styled";
import { Global, css } from "@emotion/react";
import { GlobalColors } from "./styles/colors";
import { GlobalFonts } from "./styles/fonts";
import { GlobalScrollbars } from "./styles/scrollbars";
import type { ProjectConfig } from "./config";
import type { WorkspaceSelection } from "./components/ProjectSidebar";
import { LeftSidebar } from "./components/LeftSidebar";
import NewWorkspaceModal from "./components/NewWorkspaceModal";
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
import { getThinkingLevelKey } from "./constants/storage";
import type { BranchListResult } from "./types/ipc";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "low", "medium", "high"];

// Global Styles with nice fonts
const globalStyles = css`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    height: 100vh;
    overflow: hidden;
    background: #1e1e1e;
    color: #fff;
    font-family: var(--font-primary);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  code {
    font-family: var(--font-monospace);
  }

  /* Enable native tooltips */
  [title] {
    position: relative;
  }

  [title]:hover::after {
    content: attr(title);
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    padding: 6px 10px;
    background: #2d2d30;
    color: #cccccc;
    border: 1px solid #464647;
    border-radius: 4px;
    font-size: 11px;
    white-space: nowrap;
    z-index: 1000;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  [title]:hover::before {
    content: "";
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 3px;
    border-width: 5px;
    border-style: solid;
    border-color: #2d2d30 transparent transparent transparent;
    z-index: 1000;
    pointer-events: none;
  }
`;

// Styled Components
const AppContainer = styled.div`
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #1e1e1e;
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ContentArea = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
`;

const WelcomeView = styled.div`
  text-align: center;
  padding: clamp(40px, 10vh, 100px) 20px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;

  h2 {
    color: #fff;
    font-size: clamp(24px, 5vw, 36px);
    margin-bottom: 16px;
    font-weight: 700;
    letter-spacing: -1px;
  }

  p {
    color: #888;
    font-size: clamp(14px, 2vw, 16px);
    line-height: 1.6;
  }
`;

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
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("sidebarCollapsed", false);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, [setSidebarCollapsed]);

  // Use custom hooks for project and workspace management
  const { projects, setProjects, addProject, removeProject } = useProjectManagement();

  // Workspace management needs to update projects state when workspace operations complete
  const handleProjectsUpdate = useCallback(
    (newProjects: Map<string, ProjectConfig>) => {
      setProjects(newProjects);
    },
    [setProjects]
  );

  const { workspaceMetadata, createWorkspace, removeWorkspace, renameWorkspace } =
    useWorkspaceManagement({
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

      // Update window title
      const title = `${selectedWorkspace.workspaceId} - ${selectedWorkspace.projectName} - cmux`;
      void window.api.window.setTitle(title);
    } else {
      // Clear hash when no workspace selected
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      void window.api.window.setTitle("cmux");
    }
  }, [selectedWorkspace]);

  // Restore workspace from URL on mount (if valid)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#workspace=")) {
      const workspaceId = decodeURIComponent(hash.substring("#workspace=".length));

      // Find workspace in metadata
      const metadata = Array.from(workspaceMetadata.values()).find((ws) => ws.id === workspaceId);

      if (metadata) {
        // Find project for this workspace
        for (const [projectPath, projectConfig] of projects.entries()) {
          const workspace = projectConfig.workspaces.find(
            (ws) => ws.path === metadata.workspacePath
          );
          if (workspace) {
            setSelectedWorkspace({
              workspaceId: metadata.id,
              projectPath,
              projectName: metadata.projectName,
              workspacePath: metadata.workspacePath,
            });
            break;
          }
        }
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openWorkspaceInTerminal = useCallback((workspacePath: string) => {
    void window.api.workspace.openTerminal(workspacePath);
  }, []);

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
  // Use stable reference to prevent sidebar re-renders when sort order hasn't changed
  const sortedWorkspacesByProject = useStableReference(
    () => {
      const result = new Map<string, ProjectConfig["workspaces"]>();
      for (const [projectPath, config] of projects) {
        result.set(
          projectPath,
          config.workspaces.slice().sort((a, b) => {
            const aMeta = workspaceMetadata.get(a.path);
            const bMeta = workspaceMetadata.get(b.path);
            if (!aMeta || !bMeta) return 0;

            // Get timestamp of most recent user message (0 if never used)
            const aTimestamp = workspaceRecency[aMeta.id] ?? 0;
            const bTimestamp = workspaceRecency[bMeta.id] ?? 0;
            return bTimestamp - aTimestamp;
          })
        );
      }
      return result;
    },
    (prev, next) => {
      // Compare Maps: check if both size and workspace order are the same
      if (
        !compareMaps(prev, next, (a, b) => {
          if (a.length !== b.length) return false;
          return a.every((workspace, i) => workspace.path === b[i].path);
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
        (ws) => ws.path === selectedWorkspace.workspacePath
      );
      if (currentIndex === -1) return;

      // Calculate next/prev index with wrapping
      let targetIndex: number;
      if (direction === "next") {
        targetIndex = (currentIndex + 1) % sortedWorkspaces.length;
      } else {
        targetIndex = currentIndex === 0 ? sortedWorkspaces.length - 1 : currentIndex - 1;
      }

      const targetWorkspace = sortedWorkspaces[targetIndex];
      if (!targetWorkspace) return;

      const metadata = workspaceMetadata.get(targetWorkspace.path);
      if (!metadata) return;

      setSelectedWorkspace({
        projectPath: selectedWorkspace.projectPath,
        projectName: selectedWorkspace.projectName,
        workspacePath: targetWorkspace.path,
        workspaceId: metadata.id,
      });
    },
    [selectedWorkspace, sortedWorkspacesByProject, workspaceMetadata, setSelectedWorkspace]
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
      if (newWs) setSelectedWorkspace(newWs);
    },
    [createWorkspace, setSelectedWorkspace]
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
    (selection: {
      projectPath: string;
      projectName: string;
      workspacePath: string;
      workspaceId: string;
    }) => {
      setSelectedWorkspace(selection);
    },
    [setSelectedWorkspace]
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

  return (
    <>
      <GlobalColors />
      <GlobalFonts />
      <GlobalScrollbars />
      <Global styles={globalStyles} />
      <AppContainer>
        <LeftSidebar
          projects={projects}
          workspaceMetadata={workspaceMetadata}
          selectedWorkspace={selectedWorkspace}
          onSelectWorkspace={setSelectedWorkspace}
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
        />
        <MainContent>
          <ContentArea>
            {selectedWorkspace ? (
              <ErrorBoundary
                workspaceInfo={`${selectedWorkspace.projectName}/${selectedWorkspace.workspacePath.split("/").pop() ?? ""}`}
              >
                <AIView
                  key={selectedWorkspace.workspaceId}
                  workspaceId={selectedWorkspace.workspaceId}
                  projectName={selectedWorkspace.projectName}
                  branch={selectedWorkspace.workspacePath.split("/").pop() ?? ""}
                  workspacePath={selectedWorkspace.workspacePath}
                />
              </ErrorBoundary>
            ) : (
              <WelcomeView>
                <h2>Welcome to Cmux</h2>
                <p>Select a workspace from the sidebar or add a new one to get started.</p>
              </WelcomeView>
            )}
          </ContentArea>
        </MainContent>
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
      </AppContainer>
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

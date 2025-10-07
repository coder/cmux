import { useState, useEffect, useCallback } from "react";
import styled from "@emotion/styled";
import { Global, css } from "@emotion/react";
import { GlobalColors } from "./styles/colors";
import { GlobalFonts } from "./styles/fonts";
import type { ProjectConfig } from "./config";
import type { WorkspaceSelection } from "./components/ProjectSidebar";
import ProjectSidebar from "./components/ProjectSidebar";
import NewWorkspaceModal from "./components/NewWorkspaceModal";
import { AIView } from "./components/AIView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TipsCarousel } from "./components/TipsCarousel";
import { usePersistedState } from "./hooks/usePersistedState";
import { matchesKeybind, KEYBINDS } from "./utils/ui/keybinds";
import { useProjectManagement } from "./hooks/useProjectManagement";
import { useWorkspaceManagement } from "./hooks/useWorkspaceManagement";
import { useWorkspaceAggregators } from "./hooks/useWorkspaceAggregators";
import { useGitStatus } from "./hooks/useGitStatus";

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

const AppHeader = styled.header`
  padding: 10px 20px;
  background: #2d2d2d;
  border-bottom: 1px solid #444;
  display: flex;
  align-items: center;
  gap: 24px;

  h1 {
    color: #fff;
    font-size: 20px;
    margin: 0;
    font-weight: 600;
    letter-spacing: -0.5px;
    line-height: 1;
    display: flex;
    align-items: center;
  }
`;

const ContentArea = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
`;

const WelcomeView = styled.div`
  text-align: center;
  padding-top: 100px;

  h2 {
    color: #fff;
    font-size: 36px;
    margin-bottom: 16px;
    font-weight: 700;
    letter-spacing: -1px;
  }

  p {
    color: #888;
    font-size: 16px;
    line-height: 1.6;
  }
`;

function App() {
  const [selectedWorkspace, setSelectedWorkspace] = usePersistedState<WorkspaceSelection | null>(
    "selectedWorkspace",
    null
  );
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceModalProject, setWorkspaceModalProject] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("sidebarCollapsed", false);

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
      projects,
      selectedWorkspace,
      onProjectsUpdate: handleProjectsUpdate,
      onSelectedWorkspaceUpdate: setSelectedWorkspace,
    });

  // Use workspace aggregators hook for message state
  const { getWorkspaceState } = useWorkspaceAggregators(workspaceMetadata);

  // Enrich workspace metadata with git status
  const displayedWorkspaceMetadata = useGitStatus(workspaceMetadata);

  const handleRemoveProject = async (path: string) => {
    // Clear selected workspace if it belongs to the removed project
    if (selectedWorkspace?.projectPath === path) {
      setSelectedWorkspace(null);
    }
    await removeProject(path);
  };

  const handleAddWorkspace = (projectPath: string) => {
    setWorkspaceModalProject(projectPath);
    setWorkspaceModalOpen(true);
  };

  const handleCreateWorkspace = async (branchName: string) => {
    if (!workspaceModalProject) return;

    const newWorkspace = await createWorkspace(workspaceModalProject, branchName);
    if (newWorkspace) {
      setSelectedWorkspace(newWorkspace);
    }
  };

  const handleNavigateWorkspace = useCallback(
    (direction: "next" | "prev") => {
      if (!selectedWorkspace) return;

      const projectConfig = projects.get(selectedWorkspace.projectPath);
      if (!projectConfig || projectConfig.workspaces.length <= 1) return;

      // Find current workspace index
      const currentIndex = projectConfig.workspaces.findIndex(
        (ws) => ws.path === selectedWorkspace.workspacePath
      );
      if (currentIndex === -1) return;

      // Calculate next/prev index with wrapping
      let targetIndex: number;
      if (direction === "next") {
        targetIndex = (currentIndex + 1) % projectConfig.workspaces.length;
      } else {
        targetIndex = currentIndex === 0 ? projectConfig.workspaces.length - 1 : currentIndex - 1;
      }

      const targetWorkspace = projectConfig.workspaces[targetIndex];
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
    [selectedWorkspace, projects, workspaceMetadata, setSelectedWorkspace]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesKeybind(e, KEYBINDS.NEXT_WORKSPACE)) {
        e.preventDefault();
        handleNavigateWorkspace("next");
      } else if (matchesKeybind(e, KEYBINDS.PREV_WORKSPACE)) {
        e.preventDefault();
        handleNavigateWorkspace("prev");
      } else if (matchesKeybind(e, KEYBINDS.TOGGLE_SIDEBAR)) {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNavigateWorkspace, setSidebarCollapsed]);

  return (
    <>
      <GlobalColors />
      <GlobalFonts />
      <Global styles={globalStyles} />
      <AppContainer>
        <ProjectSidebar
          projects={projects}
          workspaceMetadata={displayedWorkspaceMetadata}
          selectedWorkspace={selectedWorkspace}
          onSelectWorkspace={setSelectedWorkspace}
          onAddProject={() => void addProject()}
          onAddWorkspace={(projectPath) => void handleAddWorkspace(projectPath)}
          onRemoveProject={(path) => void handleRemoveProject(path)}
          onRemoveWorkspace={removeWorkspace}
          onRenameWorkspace={renameWorkspace}
          getWorkspaceState={getWorkspaceState}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        />
        <MainContent>
          <AppHeader>
            <h1>coder multiplexer</h1>
            <TipsCarousel />
          </AppHeader>
          <ContentArea>
            {selectedWorkspace ? (
              <ErrorBoundary
                workspaceInfo={`${selectedWorkspace.projectName}/${selectedWorkspace.workspacePath.split("/").pop() ?? ""}`}
              >
                <AIView
                  workspaceId={selectedWorkspace.workspaceId}
                  projectName={selectedWorkspace.projectName}
                  branch={selectedWorkspace.workspacePath.split("/").pop() ?? ""}
                  workspaceState={getWorkspaceState(selectedWorkspace.workspaceId)}
                  gitStatus={
                    displayedWorkspaceMetadata.get(selectedWorkspace.workspacePath)?.gitStatus ??
                    null
                  }
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
        {workspaceModalOpen && workspaceModalProject && (
          <NewWorkspaceModal
            isOpen={workspaceModalOpen}
            projectPath={workspaceModalProject}
            onClose={() => {
              setWorkspaceModalOpen(false);
              setWorkspaceModalProject(null);
            }}
            onAdd={handleCreateWorkspace}
          />
        )}
      </AppContainer>
    </>
  );
}

export default App;

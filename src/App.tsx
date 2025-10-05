import { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { Global, css } from "@emotion/react";
import { GlobalColors } from "./styles/colors";
import { GlobalFonts } from "./styles/fonts";
import type { ProjectConfig } from "./config";
import type { WorkspaceSelection } from "./components/ProjectSidebar";
import type { WorkspaceMetadata } from "./types/workspace";
import ProjectSidebar from "./components/ProjectSidebar";
import NewWorkspaceModal from "./components/NewWorkspaceModal";
import { AIView } from "./components/AIView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { usePersistedState } from "./hooks/usePersistedState";

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

  h1 {
    color: #fff;
    font-size: 20px;
    margin: 0;
    font-weight: 600;
    letter-spacing: -0.5px;
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
  const [projects, setProjects] = useState<Map<string, ProjectConfig>>(new Map());
  const [workspaceMetadata, setWorkspaceMetadata] = useState<Map<string, WorkspaceMetadata>>(
    new Map()
  );
  const [selectedWorkspace, setSelectedWorkspace] = usePersistedState<WorkspaceSelection | null>(
    "selectedWorkspace",
    null
  );
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceModalProject, setWorkspaceModalProject] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
    void loadWorkspaceMetadata();
  }, []);

  const loadProjects = async () => {
    try {
      console.log("Loading projects from config...");
      const config = await window.api.config.load();
      console.log("Received config:", config);

      if (config && Array.isArray(config.projects)) {
        console.log("Projects array length:", config.projects.length);
        const projectsMap = new Map<string, ProjectConfig>(config.projects);
        console.log("Created projects map, size:", projectsMap.size);
        setProjects(projectsMap);
      } else {
        console.log("No projects or invalid format");
        setProjects(new Map());
      }
    } catch (error) {
      console.error("Failed to load config:", error);
      setProjects(new Map());
    }
  };

  const loadWorkspaceMetadata = async () => {
    try {
      const metadataList = await window.api.workspace.list();
      const metadataMap = new Map();
      for (const metadata of metadataList) {
        metadataMap.set(metadata.workspacePath, metadata);
      }
      setWorkspaceMetadata(metadataMap);
    } catch (error) {
      console.error("Failed to load workspace metadata:", error);
    }
  };

  const handleAddProject = async () => {
    try {
      const selectedPath = await window.api.dialog.selectDirectory();
      if (selectedPath && !projects.has(selectedPath)) {
        const newProjects = new Map(projects);
        newProjects.set(selectedPath, { path: selectedPath, workspaces: [] });
        setProjects(newProjects);

        await window.api.config.save({
          projects: Array.from(newProjects.entries()),
        });
      }
    } catch (error) {
      console.error("Failed to add project:", error);
    }
  };

  const handleRemoveProject = async (path: string) => {
    const newProjects = new Map(projects);
    newProjects.delete(path);
    setProjects(newProjects);

    // Clear selected workspace if it belongs to the removed project
    if (selectedWorkspace?.projectPath === path) {
      setSelectedWorkspace(null);
    }

    try {
      await window.api.config.save({
        projects: Array.from(newProjects.entries()),
      });
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  };

  const handleAddWorkspace = (projectPath: string) => {
    setWorkspaceModalProject(projectPath);
    setWorkspaceModalOpen(true);
  };

  const handleCreateWorkspace = async (branchName: string) => {
    if (!workspaceModalProject) return;

    const result = await window.api.workspace.create(workspaceModalProject, branchName);
    if (result.success) {
      // Update the project config with the new workspace
      const newProjects = new Map(projects);
      const projectConfig = newProjects.get(workspaceModalProject);
      if (projectConfig) {
        projectConfig.workspaces.push({
          path: result.metadata.workspacePath,
        });
        setProjects(newProjects);

        await window.api.config.save({
          projects: Array.from(newProjects.entries()),
        });

        // Reload workspace metadata to get the new workspace ID
        await loadWorkspaceMetadata();

        // Construct WorkspaceSelection from backend metadata + frontend context
        setSelectedWorkspace({
          projectPath: workspaceModalProject,
          projectName: result.metadata.projectName,
          workspacePath: result.metadata.workspacePath,
          workspaceId: result.metadata.id,
        });
      }
    } else {
      throw new Error(result.error);
    }
  };

  const handleRemoveWorkspace = async (workspaceId: string) => {
    const result = await window.api.workspace.remove(workspaceId);
    if (result.success) {
      // Reload config since backend has updated it
      const config = await window.api.config.load();
      const loadedProjects = new Map(config.projects);
      setProjects(loadedProjects);

      // Reload workspace metadata
      await loadWorkspaceMetadata();

      // Clear selected workspace if it was removed
      if (selectedWorkspace?.workspaceId === workspaceId) {
        setSelectedWorkspace(null);
      }
    } else {
      console.error("Failed to remove workspace:", result.error);
    }
  };

  const handleRenameWorkspace = async (
    workspaceId: string,
    newName: string
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await window.api.workspace.rename(workspaceId, newName);
    if (result.success) {
      // Reload config since backend has updated it
      const config = await window.api.config.load();
      const loadedProjects = new Map(config.projects);
      setProjects(loadedProjects);

      // Reload workspace metadata
      await loadWorkspaceMetadata();

      // Update selected workspace if it was renamed
      if (selectedWorkspace?.workspaceId === workspaceId) {
        const newWorkspaceId = result.data.newWorkspaceId;

        // Get updated workspace metadata from backend
        const newMetadata = await window.api.workspace.getInfo(newWorkspaceId);
        if (newMetadata) {
          setSelectedWorkspace({
            projectPath: selectedWorkspace.projectPath,
            projectName: newMetadata.projectName,
            workspacePath: newMetadata.workspacePath,
            workspaceId: newWorkspaceId,
          });
        }
      }
      return { success: true };
    } else {
      console.error("Failed to rename workspace:", result.error);
      return { success: false, error: result.error };
    }
  };

  return (
    <>
      <GlobalColors />
      <GlobalFonts />
      <Global styles={globalStyles} />
      <AppContainer>
        <ProjectSidebar
          projects={projects}
          workspaceMetadata={workspaceMetadata}
          selectedWorkspace={selectedWorkspace}
          onSelectWorkspace={setSelectedWorkspace}
          onAddProject={() => void handleAddProject()}
          onAddWorkspace={(projectPath) => void handleAddWorkspace(projectPath)}
          onRemoveProject={(path) => void handleRemoveProject(path)}
          onRemoveWorkspace={(workspaceId) => void handleRemoveWorkspace(workspaceId)}
          onRenameWorkspace={handleRenameWorkspace}
        />
        <MainContent>
          <AppHeader>
            <h1>coder multiplexer</h1>
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

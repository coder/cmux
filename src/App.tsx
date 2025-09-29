import { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { Global, css } from "@emotion/react";
import { GlobalColors } from "./styles/colors";
import { GlobalFonts } from "./styles/fonts";
import ProjectSidebar, { ProjectConfig, WorkspaceSelection } from "./components/ProjectSidebar";
import NewWorkspaceModal from "./components/NewWorkspaceModal";
import { AIView } from "./components/AIView";
import { ErrorBoundary } from "./components/ErrorBoundary";

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

const ProjectView = styled.div`
  h2 {
    color: #fff;
    font-size: 28px;
    margin: 0 0 8px 0;
    font-weight: 600;
    letter-spacing: -0.5px;
  }
`;

const ProjectFullPath = styled.p`
  color: #888;
  font-size: 14px;
  margin: 0 0 32px 0;
  font-family: var(--font-monospace);
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
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceSelection | null>(null);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceModalProject, setWorkspaceModalProject] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
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

    if (selectedProject === path) {
      setSelectedProject(null);
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
    if (result.success && result.path) {
      // Update the project config with the new workspace
      const newProjects = new Map(projects);
      const projectConfig = newProjects.get(workspaceModalProject);
      if (projectConfig) {
        projectConfig.workspaces.push({
          branch: branchName,
          path: result.path,
        });
        setProjects(newProjects);

        await window.api.config.save({
          projects: Array.from(newProjects.entries()),
        });
      }
    } else {
      throw new Error(result.error || "Failed to create workspace");
    }
  };

  const handleRemoveWorkspace = async (workspaceId: string) => {
    const result = await window.api.workspace.remove(workspaceId);
    if (result.success) {
      // Reload config since backend has updated it
      const config = await window.api.config.load();
      const loadedProjects = new Map(config.projects);
      setProjects(loadedProjects);

      // Clear selected workspace if it was removed
      if (selectedWorkspace?.workspaceId === workspaceId) {
        setSelectedWorkspace(null);
      }
    } else {
      console.error("Failed to remove workspace:", result.error);
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
          selectedProject={selectedProject}
          selectedWorkspace={selectedWorkspace}
          onSelectProject={setSelectedProject}
          onSelectWorkspace={setSelectedWorkspace}
          onAddProject={handleAddProject}
          onAddWorkspace={handleAddWorkspace}
          onRemoveProject={handleRemoveProject}
          onRemoveWorkspace={handleRemoveWorkspace}
        />
        <MainContent>
          <AppHeader>
            <h1>coder multiplexer</h1>
          </AppHeader>
          <ContentArea>
            {selectedWorkspace ? (
              <ErrorBoundary
                workspaceInfo={`${selectedWorkspace.projectName}/${selectedWorkspace.branch}`}
              >
                <AIView
                  workspaceId={selectedWorkspace.workspaceId}
                  projectName={selectedWorkspace.projectName}
                  branch={selectedWorkspace.branch}
                />
              </ErrorBoundary>
            ) : selectedProject ? (
              <ProjectView>
                <h2>Project: {selectedProject.split("/").pop()}</h2>
                <ProjectFullPath>{selectedProject}</ProjectFullPath>
                <p style={{ color: "#888", marginTop: "20px" }}>
                  Select a workspace from the sidebar to view AI output.
                </p>
              </ProjectView>
            ) : (
              <WelcomeView>
                <h2>Welcome to Cmux</h2>
                <p>Select a project from the sidebar or add a new one to get started.</p>
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

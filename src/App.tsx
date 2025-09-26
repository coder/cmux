import { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { Global, css } from "@emotion/react";
import { GlobalColors } from "./styles/colors";
import ProjectSidebar, { ProjectConfig, WorkspaceSelection } from "./components/ProjectSidebar";
import NewWorkspaceModal from "./components/NewWorkspaceModal";
import { ClaudeView } from "./components/ClaudeView";
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
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", "Segoe UI Variable", system-ui, Roboto,
      "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  code {
    font-family:
      "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
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
  font-family:
    "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
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

    const result = await window.api.git.createWorktree(workspaceModalProject, branchName);
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

  const handleRemoveWorkspace = async (workspaceId: string, workspacePath: string) => {
    const result = await window.api.git.removeWorktree(workspacePath);
    if (result.success) {
      // Remove any active Claude query for this workspace
      await window.api.claude.removeWorkspace(workspaceId);

      // Update the project config to remove the workspace
      const newProjects = new Map(projects);
      for (const [_, config] of newProjects.entries()) {
        config.workspaces = config.workspaces.filter((w) => w.path !== workspacePath);
      }
      setProjects(newProjects);

      if (selectedWorkspace?.workspacePath === workspacePath) {
        setSelectedWorkspace(null);
      }

      await window.api.config.save({
        projects: Array.from(newProjects.entries()),
      });
    } else {
      console.error("Failed to remove workspace:", result.error);
    }
  };

  return (
    <>
      <GlobalColors />
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
                <ClaudeView
                  projectName={selectedWorkspace.projectName}
                  branch={selectedWorkspace.branch}
                  workspaceId={selectedWorkspace.workspaceId}
                />
              </ErrorBoundary>
            ) : selectedProject ? (
              <ProjectView>
                <h2>Project: {selectedProject.split("/").pop()}</h2>
                <ProjectFullPath>{selectedProject}</ProjectFullPath>
                <p style={{ color: "#888", marginTop: "20px" }}>
                  Select a workspace from the sidebar to view Claude Code output.
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

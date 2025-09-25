import React, { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import { Global, css } from '@emotion/react';
import ProjectSidebar, { ProjectConfig } from './components/ProjectSidebar';
import NewWorkspaceModal from './components/NewWorkspaceModal';

// Global Styles with nice fonts
const globalStyles = css`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body, #root {
    height: 100vh;
    overflow: hidden;
    background: #1e1e1e;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Segoe UI Variable', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  code {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
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
  padding: 20px 40px;
  background: #2d2d2d;
  border-bottom: 1px solid #444;
  
  h1 {
    color: #fff;
    font-size: 24px;
    margin: 0;
    font-weight: 600;
    letter-spacing: -0.5px;
  }
`;

const ContentArea = styled.div`
  flex: 1;
  padding: 40px;
  overflow-y: auto;
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
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
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

declare global {
  interface Window {
    api: {
      platform: string;
      config: {
        load: () => Promise<{ projects: Array<[string, ProjectConfig]> }>;
        save: (config: { projects: Array<[string, ProjectConfig]> }) => Promise<boolean>;
      };
      dialog: {
        selectDirectory: () => Promise<string | null>;
      };
      git: {
        createWorktree: (projectPath: string, branchName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
        removeWorktree: (workspacePath: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

function App() {
  const [projects, setProjects] = useState<Map<string, ProjectConfig>>(new Map());
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceModalProject, setWorkspaceModalProject] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const config = await window.api.config.load();
      if (config && Array.isArray(config.projects)) {
        const projectsMap = new Map<string, ProjectConfig>();
        config.projects.forEach(([path, projectConfig]) => {
          // Handle migration from old format
          if (typeof projectConfig === 'string') {
            projectsMap.set(path, { path, workspaces: [] });
          } else {
            projectsMap.set(path, projectConfig);
          }
        });
        setProjects(projectsMap);
      } else {
        setProjects(new Map());
      }
    } catch (error) {
      console.error('Failed to load config:', error);
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
          projects: Array.from(newProjects.entries())
        });
      }
    } catch (error) {
      console.error('Failed to add project:', error);
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
        projects: Array.from(newProjects.entries())
      });
    } catch (error) {
      console.error('Failed to save config:', error);
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
        projectConfig.workspaces.push({ branch: branchName, path: result.path });
        setProjects(newProjects);
        
        await window.api.config.save({
          projects: Array.from(newProjects.entries())
        });
      }
    } else {
      throw new Error(result.error || 'Failed to create workspace');
    }
  };

  const handleRemoveWorkspace = async (workspacePath: string) => {
    const result = await window.api.git.removeWorktree(workspacePath);
    if (result.success) {
      // Update the project config to remove the workspace
      const newProjects = new Map(projects);
      for (const [_, config] of newProjects.entries()) {
        config.workspaces = config.workspaces.filter(w => w.path !== workspacePath);
      }
      setProjects(newProjects);
      
      if (selectedWorkspace === workspacePath) {
        setSelectedWorkspace(null);
      }
      
      await window.api.config.save({
        projects: Array.from(newProjects.entries())
      });
    } else {
      console.error('Failed to remove workspace:', result.error);
    }
  };

  return (
    <>
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
            <h1>Cmux - Coding Agent Multiplexer</h1>
          </AppHeader>
          <ContentArea>
            {selectedProject ? (
              <ProjectView>
                <h2>Project: {selectedProject.split('/').pop()}</h2>
                <ProjectFullPath>{selectedProject}</ProjectFullPath>
                {/* Project content will go here */}
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
import React, { useState, useEffect } from 'react';
import './App.css';
import ProjectSidebar from './components/ProjectSidebar';

declare global {
  interface Window {
    api: {
      platform: string;
      config: {
        load: () => Promise<{ projects: string[] }>;
        save: (config: { projects: string[] }) => Promise<boolean>;
      };
      dialog: {
        selectDirectory: () => Promise<string | null>;
      };
    };
  }
}

function App() {
  const [projects, setProjects] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const config = await window.api.config.load();
      // Ensure projects is an array of strings
      if (config && Array.isArray(config.projects)) {
        const validProjects = config.projects.filter(p => typeof p === 'string');
        setProjects(new Set(validProjects));
      } else {
        setProjects(new Set());
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      setProjects(new Set());
    }
  };

  const handleAddProject = async () => {
    try {
      const selectedPath = await window.api.dialog.selectDirectory();
      if (selectedPath && !projects.has(selectedPath)) {
        const newProjects = new Set(projects);
        newProjects.add(selectedPath);
        setProjects(newProjects);

        await window.api.config.save({
          projects: Array.from(newProjects)
        });
      }
    } catch (error) {
      console.error('Failed to add project:', error);
    }
  };

  const handleRemoveProject = async (path: string) => {
    const newProjects = new Set(projects);
    newProjects.delete(path);
    setProjects(newProjects);

    if (selectedProject === path) {
      setSelectedProject(null);
    }

    try {
      await window.api.config.save({
        projects: Array.from(newProjects)
      });
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  return (
    <div className="App">
      <ProjectSidebar
        projects={projects}
        selectedProject={selectedProject}
        onSelectProject={setSelectedProject}
        onAddProject={handleAddProject}
        onRemoveProject={handleRemoveProject}
      />
      <div className="main-content">
        <header className="app-header">
          <h1>Cmux - Coding Agent Multiplexer</h1>
        </header>
        <div className="content-area">
          {selectedProject ? (
            <div className="project-view">
              <h2>Project: {selectedProject.split('/').pop()}</h2>
              <p className="project-full-path">{selectedProject}</p>
              {/* Project content will go here */}
            </div>
          ) : (
            <div className="welcome-view">
              <h2>Welcome to Cmux</h2>
              <p>Select a project from the sidebar or add a new one to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
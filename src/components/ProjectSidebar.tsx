import React from 'react';
import './ProjectSidebar.css';

interface ProjectSidebarProps {
  projects: Set<string>;
  selectedProject: string | null;
  onSelectProject: (path: string) => void;
  onAddProject: () => void;
  onRemoveProject: (path: string) => void;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  selectedProject,
  onSelectProject,
  onAddProject,
  onRemoveProject
}) => {
  const getProjectName = (path: string) => {
    if (!path || typeof path !== 'string') {
      return 'Unknown';
    }
    return path.split('/').pop() || path.split('\\').pop() || path;
  };

  return (
    <div className="project-sidebar">
      <div className="sidebar-header">
        <h2>Projects</h2>
        <button className="add-project-btn" onClick={onAddProject} title="Add Project">
          +
        </button>
      </div>
      <div className="projects-list">
        {projects.size === 0 ? (
          <div className="empty-state">
            <p>No projects</p>
            <button className="add-first-project" onClick={onAddProject}>
              Add Project
            </button>
          </div>
        ) : (
          Array.from(projects).filter(p => typeof p === 'string').map((path) => (
            <div
              key={path}
              className={`project-item ${selectedProject === path ? 'selected' : ''}`}
              onClick={() => onSelectProject(path)}
            >
              <div className="project-info">
                <div className="project-name">{getProjectName(path)}</div>
                <div className="project-path">{path}</div>
              </div>
              <button
                className="remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveProject(path);
                }}
                title="Remove project"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProjectSidebar;
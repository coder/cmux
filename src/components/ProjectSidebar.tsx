import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { css } from "@emotion/react";

// Styled Components
const SidebarContainer = styled.div`
  width: 280px;
  height: 100vh;
  background: #252526;
  border-right: 1px solid #1e1e1e;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
    "Segoe UI Variable", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif;
`;

const SidebarHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #1e1e1e;

  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #cccccc;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
`;

const AddProjectBtn = styled.button`
  width: 24px;
  height: 24px;
  background: transparent;
  color: #cccccc;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;

  &:hover {
    background: #2a2a2b;
    border-color: #3c3c3c;
  }
`;

const ProjectsList = styled.div`
  flex: 1;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #424242;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #4e4e4e;
  }
`;

const EmptyState = styled.div`
  padding: 32px 16px;
  text-align: center;

  p {
    color: #888;
    font-size: 13px;
    margin-bottom: 16px;
  }
`;

const AddFirstProjectBtn = styled.button`
  background: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #005a9e;
  }
`;

const ProjectGroup = styled.div`
  border-bottom: 1px solid #2a2a2b;
`;

const ProjectItem = styled.div<{ selected?: boolean }>`
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  border-left: 3px solid transparent;
  transition: all 0.15s;

  ${(props) =>
    props.selected &&
    css`
      background: #2a2a2b;
      border-left-color: #007acc;
    `}

  &:hover {
    background: #2a2a2b;

    button {
      opacity: 1;
    }
  }
`;

const ExpandIcon = styled.span<{ expanded?: boolean }>`
  color: #888;
  font-size: 10px;
  margin-right: 8px;
  transition: transform 0.2s;
  flex-shrink: 0;

  ${(props) =>
    props.expanded &&
    css`
      transform: rotate(90deg);
    `}
`;

const ProjectInfo = styled.div`
  flex: 1;
  min-width: 0;
  padding-right: 8px;
`;

const ProjectName = styled.div`
  color: #cccccc;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.2px;
`;

const ProjectPath = styled.div`
  color: #6e6e6e;
  font-size: 11px;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas,
    "Courier New", monospace;
`;

const RemoveBtn = styled.button`
  width: 20px;
  height: 20px;
  background: transparent;
  color: #6e6e6e;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  opacity: 0;
  flex-shrink: 0;

  &:hover {
    color: #ff5555;
    background: rgba(255, 85, 85, 0.1);
  }
`;

const WorkspacesContainer = styled.div`
  background: #1a1a1a;
  border-left: 1px solid #2a2a2b;
  margin-left: 10px;
`;

const WorkspaceHeader = styled.div`
  padding: 8px 12px;
  border-bottom: 1px solid #2a2a2b;
`;

const AddWorkspaceBtn = styled.button`
  width: 100%;
  padding: 6px 12px;
  background: transparent;
  color: #888;
  border: 1px dashed #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  text-align: left;

  &:hover {
    background: #2a2a2b;
    border-color: #555;
    color: #ccc;
  }
`;

const StatusIndicator = styled.div<{ active?: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(props) => (props.active ? "#50fa7b" : "#6e6e6e")};
  margin-right: 8px;
  flex-shrink: 0;
`;

const WorkspaceActions = styled.div`
  display: flex;
  gap: 4px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.2s;
`;

const ActionBtn = styled.button`
  width: 20px;
  height: 20px;
  background: transparent;
  color: #6e6e6e;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #cccccc;
  }

  &.terminate:hover {
    color: #ff5555;
    background: rgba(255, 85, 85, 0.1);
  }
`;

const WorkspaceItem = styled.div<{ selected?: boolean }>`
  padding: 6px 12px 6px 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  border-left: 3px solid transparent;
  transition: all 0.15s;
  font-size: 13px;

  ${(props) =>
    props.selected &&
    css`
      background: #2a2a2b;
      border-left-color: #569cd6;
    `}

  &:hover {
    background: #2a2a2b;

    button {
      opacity: 1;
    }

    .workspace-actions {
      opacity: 1;
    }
  }
`;

const BranchIcon = styled.span`
  color: #569cd6;
  margin-right: 8px;
  font-size: 14px;
`;

const WorkspaceName = styled.span`
  flex: 1;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const WorkspaceRemoveBtn = styled(RemoveBtn)`
  opacity: 0;
`;

export interface ProjectConfig {
  path: string;
  workspaces: Array<{ branch: string; path: string }>;
}

export interface WorkspaceSelection {
  projectPath: string;
  projectName: string;
  branch: string;
  workspacePath: string;
}

interface ProjectSidebarProps {
  projects: Map<string, ProjectConfig>;
  selectedProject: string | null;
  selectedWorkspace: WorkspaceSelection | null;
  onSelectProject: (path: string) => void;
  onSelectWorkspace: (selection: WorkspaceSelection) => void;
  onAddProject: () => void;
  onAddWorkspace: (projectPath: string) => void;
  onRemoveProject: (path: string) => void;
  onRemoveWorkspace: (workspacePath: string) => void;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  selectedProject,
  selectedWorkspace,
  onSelectProject,
  onSelectWorkspace,
  onAddProject,
  onAddWorkspace,
  onRemoveProject,
  onRemoveWorkspace,
}) => {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set()
  );
  const [claudeStatuses, setClaudeStatuses] = useState<Map<string, boolean>>(
    new Map()
  );

  const getProjectName = (path: string) => {
    if (!path || typeof path !== "string") {
      return "Unknown";
    }
    return path.split("/").pop() || path.split("\\").pop() || path;
  };

  const toggleProject = (projectPath: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectPath)) {
      newExpanded.delete(projectPath);
    } else {
      newExpanded.add(projectPath);
    }
    setExpandedProjects(newExpanded);
  };

  // Check Claude status for all workspaces
  useEffect(() => {
    const checkStatuses = async () => {
      const statuses = new Map<string, boolean>();

      for (const [projectPath, config] of projects.entries()) {
        const projectName = getProjectName(projectPath);
        for (const workspace of config.workspaces) {
          const key = `${projectName}-${workspace.branch}`;
          const isActive = await window.api.claude.isActive(
            projectName,
            workspace.branch
          );
          statuses.set(key, isActive);
        }
      }

      setClaudeStatuses(statuses);
    };

    checkStatuses();
    // Check every 5 seconds
    const interval = setInterval(checkStatuses, 5000);

    return () => clearInterval(interval);
  }, [projects]);



  return (
    <SidebarContainer>
      <SidebarHeader>
        <h2>Projects</h2>
        <AddProjectBtn onClick={onAddProject} title="Add Project">
          +
        </AddProjectBtn>
      </SidebarHeader>
      <ProjectsList>
        {projects.size === 0 ? (
          <EmptyState>
            <p>No projects</p>
            <AddFirstProjectBtn onClick={onAddProject}>
              Add Project
            </AddFirstProjectBtn>
          </EmptyState>
        ) : (
          Array.from(projects.entries()).map(([projectPath, config]) => (
            <ProjectGroup key={projectPath}>
              <ProjectItem
                selected={selectedProject === projectPath}
                onClick={() => {
                  onSelectProject(projectPath);
                  toggleProject(projectPath);
                }}
              >
                <ExpandIcon expanded={expandedProjects.has(projectPath)}>
                  ▶
                </ExpandIcon>
                <ProjectInfo>
                  <ProjectName>{getProjectName(projectPath)}</ProjectName>
                  <ProjectPath>{projectPath}</ProjectPath>
                </ProjectInfo>
                <RemoveBtn
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveProject(projectPath);
                  }}
                  title="Remove project"
                >
                  ×
                </RemoveBtn>
              </ProjectItem>

              {expandedProjects.has(projectPath) && (
                <WorkspacesContainer>
                  <WorkspaceHeader>
                    <AddWorkspaceBtn
                      onClick={() => onAddWorkspace(projectPath)}
                    >
                      + New Workspace
                    </AddWorkspaceBtn>
                  </WorkspaceHeader>
                  {config.workspaces.map((workspace) => {
                    const projectName = getProjectName(projectPath);
                    const key = `${projectName}-${workspace.branch}`;
                    const isActive = claudeStatuses.get(key) || false;

                    return (
                      <WorkspaceItem
                        key={workspace.path}
                        selected={selectedWorkspace?.workspacePath === workspace.path}
                        onClick={() => onSelectWorkspace({
                          projectPath,
                          projectName,
                          branch: workspace.branch,
                          workspacePath: workspace.path
                        })}
                      >
                        <StatusIndicator
                          active={isActive}
                          title={
                            isActive
                              ? "Claude Code running"
                              : "Claude Code not running"
                          }
                        />
                        <BranchIcon>⎇</BranchIcon>
                        <WorkspaceName>{workspace.branch}</WorkspaceName>
                        <WorkspaceRemoveBtn
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveWorkspace(workspace.path);
                          }}
                          title="Remove workspace"
                        >
                          ×
                        </WorkspaceRemoveBtn>
                      </WorkspaceItem>
                    );
                  })}
                </WorkspacesContainer>
              )}
            </ProjectGroup>
          ))
        )}
      </ProjectsList>
    </SidebarContainer>
  );
};

export default ProjectSidebar;

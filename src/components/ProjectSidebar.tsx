import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import type { ProjectConfig } from "../config";
import type { WorkspaceMetadata } from "../types/workspace";
import { usePersistedState } from "../hooks/usePersistedState";
import { matchesKeybind, formatKeybind, KEYBINDS } from "../utils/keybinds";

// Styled Components
const SidebarContainer = styled.div`
  width: 280px;
  height: 100vh;
  background: #252526;
  border-right: 1px solid #1e1e1e;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  font-family: var(--font-primary);
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
  font-family: var(--font-monospace);
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

const WorkspaceItem = styled.div<{ selected?: boolean }>`
  padding: 6px 12px 6px 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  border-left: 3px solid transparent;
  transition: all 0.15s;
  font-size: 13px;
  position: relative;

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
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`;

const WorkspaceNameInput = styled.input`
  flex: 1;
  background: var(--color-input-bg);
  color: var(--color-input-text);
  border: 1px solid var(--color-input-border);
  border-radius: 3px;
  padding: 2px 4px;
  font-size: 13px;
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: var(--color-input-border-focus);
  }
`;

const RenameErrorContainer = styled.div`
  position: absolute;
  top: 100%;
  left: 24px;
  right: 32px;
  margin-top: 4px;
  padding: 6px 8px;
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  border-radius: 3px;
  color: var(--color-error);
  font-size: 11px;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
`;

const WorkspaceRemoveBtn = styled(RemoveBtn)`
  opacity: 0;
`;

export interface WorkspaceSelection {
  projectPath: string;
  projectName: string;
  workspacePath: string;
  workspaceId: string;
}

interface ProjectSidebarProps {
  projects: Map<string, ProjectConfig>;
  workspaceMetadata: Map<string, WorkspaceMetadata>;
  selectedWorkspace: WorkspaceSelection | null;
  onSelectWorkspace: (selection: WorkspaceSelection) => void;
  onAddProject: () => void;
  onAddWorkspace: (projectPath: string) => void;
  onRemoveProject: (path: string) => void;
  onRemoveWorkspace: (workspaceId: string) => void;
  onRenameWorkspace: (
    workspaceId: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string }>;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  workspaceMetadata,
  selectedWorkspace,
  onSelectWorkspace,
  onAddProject,
  onAddWorkspace,
  onRemoveProject,
  onRemoveWorkspace,
  onRenameWorkspace,
}) => {
  // Store as array in localStorage, convert to Set for usage
  const [expandedProjectsArray, setExpandedProjectsArray] = usePersistedState<string[]>(
    "expandedProjects",
    []
  );
  // Handle corrupted localStorage data (old Set stored as {})
  const expandedProjects = new Set(
    Array.isArray(expandedProjectsArray) ? expandedProjectsArray : []
  );
  const setExpandedProjects = (projects: Set<string>) => {
    setExpandedProjectsArray(Array.from(projects));
  };
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const getProjectName = (path: string) => {
    if (!path || typeof path !== "string") {
      return "Unknown";
    }
    return path.split("/").pop() ?? path.split("\\").pop() ?? path;
  };

  const getWorkspaceDisplayName = (workspacePath: string) => {
    // Extract display name from workspace path (e.g., "~/.cmux/src/cmux/main" -> "main")
    const parts = workspacePath.split("/");
    return parts[parts.length - 1] ?? workspacePath;
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

  const startRenaming = (workspaceId: string, currentName: string) => {
    setEditingWorkspaceId(workspaceId);
    setEditingName(currentName);
    setRenameError(null);
  };

  const cancelRenaming = () => {
    setEditingWorkspaceId(null);
    setEditingName("");
    setRenameError(null);
  };

  const confirmRename = async (workspaceId: string) => {
    if (editingName.trim() && editingName.trim() !== "") {
      const result = await onRenameWorkspace(workspaceId, editingName.trim());
      if (result.success) {
        cancelRenaming();
      } else {
        // Keep field open and show error
        setRenameError(result.error ?? "Failed to rename workspace");
      }
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, workspaceId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void confirmRename(workspaceId);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRenaming();
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Create new workspace for the project of the selected workspace
      if (matchesKeybind(e, KEYBINDS.NEW_WORKSPACE) && selectedWorkspace) {
        e.preventDefault();
        onAddWorkspace(selectedWorkspace.projectPath);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedWorkspace, onAddWorkspace]);

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
            <AddFirstProjectBtn onClick={onAddProject}>Add Project</AddFirstProjectBtn>
          </EmptyState>
        ) : (
          Array.from(projects.entries()).map(([projectPath, config]) => (
            <ProjectGroup key={projectPath}>
              <ProjectItem onClick={() => toggleProject(projectPath)}>
                <ExpandIcon expanded={expandedProjects.has(projectPath)}>▶</ExpandIcon>
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
                    <AddWorkspaceBtn onClick={() => onAddWorkspace(projectPath)}>
                      + New Workspace
                      {selectedWorkspace?.projectPath === projectPath &&
                        ` (${formatKeybind(KEYBINDS.NEW_WORKSPACE)})`}
                    </AddWorkspaceBtn>
                  </WorkspaceHeader>
                  {config.workspaces.map((workspace) => {
                    const projectName = getProjectName(projectPath);
                    const metadata = workspaceMetadata.get(workspace.path);
                    if (!metadata) return null; // Skip if metadata not loaded yet

                    const workspaceId = metadata.id;
                    const displayName = getWorkspaceDisplayName(workspace.path);
                    const isActive = false; // Simplified - no active state tracking
                    const isEditing = editingWorkspaceId === workspaceId;

                    return (
                      <WorkspaceItem
                        key={workspace.path}
                        selected={selectedWorkspace?.workspacePath === workspace.path}
                        onClick={() =>
                          onSelectWorkspace({
                            projectPath,
                            projectName,
                            workspacePath: workspace.path,
                            workspaceId,
                          })
                        }
                      >
                        <StatusIndicator active={isActive} title="AI Assistant" />
                        <BranchIcon>⎇</BranchIcon>
                        {isEditing ? (
                          <WorkspaceNameInput
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => handleRenameKeyDown(e, workspaceId)}
                            onBlur={() => void confirmRename(workspaceId)}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <WorkspaceName
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              startRenaming(workspaceId, displayName);
                            }}
                            title="Double-click to rename"
                          >
                            {displayName}
                          </WorkspaceName>
                        )}
                        <WorkspaceRemoveBtn
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveWorkspace(workspaceId);
                          }}
                          title="Remove workspace"
                        >
                          ×
                        </WorkspaceRemoveBtn>
                        {isEditing && renameError && (
                          <RenameErrorContainer>{renameError}</RenameErrorContainer>
                        )}
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

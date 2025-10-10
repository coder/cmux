import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import type { ProjectConfig } from "@/config";
import type { WorkspaceMetadata } from "@/types/workspace";
import { useGitStatus } from "@/contexts/GitStatusContext";
import { usePersistedState } from "@/hooks/usePersistedState";
import { matchesKeybind, formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";
import { abbreviatePath } from "@/utils/ui/pathAbbreviation";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { StatusIndicator } from "./StatusIndicator";
import { getModelName } from "@/utils/ai/models";
import { GitStatusIndicator } from "./GitStatusIndicator";
import type { WorkspaceState } from "@/hooks/useWorkspaceAggregators";
import SecretsModal from "./SecretsModal";
import type { Secret } from "@/types/secrets";
import { ForceDeleteModal } from "./ForceDeleteModal";

// Styled Components
const SidebarContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
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

const CollapseButton = styled.button`
  width: 100%;
  height: 36px;
  background: transparent;
  color: #888;
  border: none;
  border-top: 1px solid #1e1e1e;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
  margin-top: auto;

  &:hover {
    background: #2a2a2b;
    color: #ccc;
  }
`;

const ProjectsList = styled.div`
  flex: 1;
  overflow-y: auto;
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

const SecretsBtn = styled.button`
  width: 20px;
  height: 20px;
  background: transparent;
  color: #6e6e6e;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  opacity: 0;
  flex-shrink: 0;
  margin-right: 4px;

  &:hover {
    color: #569cd6;
    background: rgba(86, 156, 214, 0.1);
  }
`;

const WorkspacesContainer = styled.div`
  background: #1a1a1a;
`;

const WorkspaceHeader = styled.div`
  padding: 8px 12px 8px 22px;
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

const WorkspaceStatusIndicator = styled(StatusIndicator)`
  margin-left: 8px;
`;

const WorkspaceItem = styled.div<{ selected?: boolean }>`
  padding: 6px 12px 6px 28px;
  cursor: pointer;
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  gap: 8px;
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

const WorkspaceName = styled.span`
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: background 0.2s;
  min-width: 0; /* Allow grid item to shrink below content size */
  text-align: right;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`;

const WorkspaceNameInput = styled.input`
  background: var(--color-input-bg);
  color: var(--color-input-text);
  border: 1px solid var(--color-input-border);
  border-radius: 3px;
  padding: 2px 4px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  min-width: 0; /* Allow grid item to shrink */
  text-align: right;

  &:focus {
    border-color: var(--color-input-border-focus);
  }
`;

const WorkspaceErrorContainer = styled.div`
  position: absolute;
  top: 100%;
  left: 28px;
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

const RemoveErrorToast = styled.div<{ top: number; left: number }>`
  position: fixed;
  top: ${(props) => props.top}px;
  left: ${(props) => props.left}px;
  max-width: 400px;
  padding: 12px 16px;
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  border-radius: 6px;
  color: var(--color-error);
  font-size: 12px;
  z-index: 10000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  font-family: var(--font-monospace);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  pointer-events: auto;
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
  onRemoveWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  onRenameWorkspace: (
    workspaceId: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string }>;
  getWorkspaceState: (workspaceId: string) => WorkspaceState;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onGetSecrets: (projectPath: string) => Promise<Secret[]>;
  onUpdateSecrets: (projectPath: string, secrets: Secret[]) => Promise<void>;
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
  getWorkspaceState,
  collapsed,
  onToggleCollapsed,
  onGetSecrets,
  onUpdateSecrets,
}) => {
  // Subscribe to git status updates (causes this component to re-render every 10s)
  const gitStatus = useGitStatus();

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
  const [originalName, setOriginalName] = useState<string>("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<{
    workspaceId: string;
    error: string;
    position: { top: number; left: number };
  } | null>(null);
  const [secretsModalState, setSecretsModalState] = useState<{
    isOpen: boolean;
    projectPath: string;
    projectName: string;
    secrets: Secret[];
  } | null>(null);
  const [forceDeleteModal, setForceDeleteModal] = useState<{
    isOpen: boolean;
    workspaceId: string;
    error: string;
  } | null>(null);

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
    setOriginalName(currentName);
    setRenameError(null);
  };

  const cancelRenaming = () => {
    setEditingWorkspaceId(null);
    setEditingName("");
    setOriginalName("");
    setRenameError(null);
  };

  const confirmRename = async (workspaceId: string) => {
    const trimmedName = editingName.trim();
    if (trimmedName && trimmedName !== "") {
      // Short-circuit if name hasn't changed
      if (trimmedName === originalName) {
        cancelRenaming();
        return;
      }

      const result = await onRenameWorkspace(workspaceId, trimmedName);
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

  const handleRemoveWorkspace = async (workspaceId: string, buttonElement: HTMLElement) => {
    const result = await onRemoveWorkspace(workspaceId);
    if (!result.success) {
      const error = result.error ?? "Failed to remove workspace";
      
      // Check if this is a git --delete error (uncommitted changes, etc.)
      if (error.includes("--delete")) {
        // Show force delete modal instead of toast
        setForceDeleteModal({
          isOpen: true,
          workspaceId,
          error,
        });
      } else {
        // Show regular error toast
        const rect = buttonElement.getBoundingClientRect();
        setRemoveError({
          workspaceId,
          error,
          position: {
            top: rect.top + window.scrollY,
            left: rect.right + 10, // 10px to the right of button
          },
        });
        // Clear error after 5 seconds
        setTimeout(() => {
          setRemoveError(null);
        }, 5000);
      }
    }
  };

  const handleOpenSecrets = async (projectPath: string) => {
    const secrets = await onGetSecrets(projectPath);
    setSecretsModalState({
      isOpen: true,
      projectPath,
      projectName: getProjectName(projectPath),
      secrets,
    });
  };

  const handleForceDelete = async (workspaceId: string) => {
    const result = await window.api.workspace.removeForce(workspaceId);
    if (result.success) {
      setForceDeleteModal(null);
    } else {
      // Even force delete failed - show error in console and close modal
      console.error("Force delete failed:", result.error);
      setForceDeleteModal(null);
    }
  };

  const handleSaveSecrets = async (secrets: Secret[]) => {
    if (secretsModalState) {
      await onUpdateSecrets(secretsModalState.projectPath, secrets);
    }
  };

  const handleCloseSecrets = () => {
    setSecretsModalState(null);
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
    <SidebarContent role="navigation" aria-label="Projects">
      {!collapsed && (
        <>
          <SidebarHeader>
            <h2>Projects</h2>
            <AddProjectBtn onClick={onAddProject} title="Add Project" aria-label="Add project">
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
              Array.from(projects.entries()).map(([projectPath, config]) => {
                const projectName = getProjectName(projectPath);
                const sanitizedProjectId = projectPath.replace(/[^a-zA-Z0-9_-]/g, "-") || "root";
                const workspaceListId = `workspace-list-${sanitizedProjectId}`;
                const isExpanded = expandedProjects.has(projectPath);

                return (
                  <ProjectGroup key={projectPath}>
                    <ProjectItem
                      onClick={() => toggleProject(projectPath)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleProject(projectPath);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-controls={workspaceListId}
                      data-project-path={projectPath}
                    >
                      <ExpandIcon
                        expanded={isExpanded}
                        data-project-path={projectPath}
                        aria-hidden="true"
                      >
                        ▶
                      </ExpandIcon>
                      <ProjectInfo>
                        <ProjectName>{projectName}</ProjectName>
                        <TooltipWrapper inline>
                          <ProjectPath>{abbreviatePath(projectPath)}</ProjectPath>
                          <Tooltip className="tooltip" align="left">
                            {projectPath}
                          </Tooltip>
                        </TooltipWrapper>
                      </ProjectInfo>
                      <TooltipWrapper inline>
                        <SecretsBtn
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleOpenSecrets(projectPath);
                          }}
                          aria-label={`Manage secrets for ${projectName}`}
                          data-project-path={projectPath}
                        >
                          🔑
                        </SecretsBtn>
                        <Tooltip className="tooltip" align="right">
                          Manage secrets
                        </Tooltip>
                      </TooltipWrapper>
                      <TooltipWrapper inline>
                        <RemoveBtn
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveProject(projectPath);
                          }}
                          title="Remove project"
                          aria-label={`Remove project ${projectName}`}
                          data-project-path={projectPath}
                        >
                          ×
                        </RemoveBtn>
                        <Tooltip className="tooltip" align="right">
                          Remove project
                        </Tooltip>
                      </TooltipWrapper>
                    </ProjectItem>

                    {isExpanded && (
                      <WorkspacesContainer id={workspaceListId}>
                        <WorkspaceHeader>
                          <AddWorkspaceBtn
                            onClick={() => onAddWorkspace(projectPath)}
                            data-project-path={projectPath}
                            aria-label={`Add workspace to ${projectName}`}
                          >
                            + New Workspace
                            {selectedWorkspace?.projectPath === projectPath &&
                              ` (${formatKeybind(KEYBINDS.NEW_WORKSPACE)})`}
                          </AddWorkspaceBtn>
                        </WorkspaceHeader>
                        {config.workspaces.map((workspace) => {
                          const metadata = workspaceMetadata.get(workspace.path);
                          if (!metadata) return null;

                          const workspaceId = metadata.id;
                          const displayName = getWorkspaceDisplayName(workspace.path);
                          const workspaceState = getWorkspaceState(workspaceId);
                          const isStreaming = workspaceState.canInterrupt;
                          const streamingModel = workspaceState.currentModel;
                          const isEditing = editingWorkspaceId === workspaceId;
                          const isSelected = selectedWorkspace?.workspacePath === workspace.path;

                          return (
                            <React.Fragment key={workspace.path}>
                              <WorkspaceItem
                                selected={isSelected}
                                onClick={() =>
                                  onSelectWorkspace({
                                    projectPath,
                                    projectName,
                                    workspacePath: workspace.path,
                                    workspaceId,
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onSelectWorkspace({
                                      projectPath,
                                      projectName,
                                      workspacePath: workspace.path,
                                      workspaceId,
                                    });
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-current={isSelected ? "true" : undefined}
                                data-workspace-path={workspace.path}
                                data-workspace-id={workspaceId}
                              >
                                <TooltipWrapper inline>
                                  <WorkspaceRemoveBtn
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleRemoveWorkspace(workspaceId, e.currentTarget);
                                    }}
                                    aria-label={`Remove workspace ${displayName}`}
                                    data-workspace-id={workspaceId}
                                  >
                                    ×
                                  </WorkspaceRemoveBtn>
                                  <Tooltip className="tooltip" align="right">
                                    Remove workspace
                                  </Tooltip>
                                </TooltipWrapper>
                                <GitStatusIndicator
                                  gitStatus={gitStatus.get(metadata.id) ?? null}
                                  workspaceId={workspaceId}
                                  tooltipPosition="right"
                                />
                                {isEditing ? (
                                  <WorkspaceNameInput
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onKeyDown={(e) => handleRenameKeyDown(e, workspaceId)}
                                    onBlur={() => void confirmRename(workspaceId)}
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={`Rename workspace ${displayName}`}
                                    data-workspace-id={workspaceId}
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
                                <WorkspaceStatusIndicator
                                  streaming={isStreaming}
                                  title={
                                    isStreaming && streamingModel
                                      ? `${getModelName(streamingModel)} streaming`
                                      : "Idle"
                                  }
                                />
                              </WorkspaceItem>
                              {isEditing && renameError && (
                                <WorkspaceErrorContainer>{renameError}</WorkspaceErrorContainer>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </WorkspacesContainer>
                    )}
                  </ProjectGroup>
                );
              })
            )}
          </ProjectsList>
        </>
      )}
      <TooltipWrapper inline>
        <CollapseButton onClick={onToggleCollapsed}>{collapsed ? "»" : "«"}</CollapseButton>
        <Tooltip className="tooltip" align="center">
          {collapsed ? "Expand sidebar" : "Collapse sidebar"} (
          {formatKeybind(KEYBINDS.TOGGLE_SIDEBAR)})
        </Tooltip>
      </TooltipWrapper>
      {secretsModalState && (
        <SecretsModal
          isOpen={secretsModalState.isOpen}
          projectPath={secretsModalState.projectPath}
          projectName={secretsModalState.projectName}
          initialSecrets={secretsModalState.secrets}
          onClose={handleCloseSecrets}
          onSave={handleSaveSecrets}
        />
      )}
      {forceDeleteModal && (
        <ForceDeleteModal
          isOpen={forceDeleteModal.isOpen}
          workspaceId={forceDeleteModal.workspaceId}
          error={forceDeleteModal.error}
          onClose={() => setForceDeleteModal(null)}
          onForceDelete={handleForceDelete}
        />
      )}
      {removeError &&
        createPortal(
          <RemoveErrorToast top={removeError.position.top} left={removeError.position.left}>
            Failed to remove workspace: {removeError.error}
          </RemoveErrorToast>,
          document.body
        )}
    </SidebarContent>
  );
};

export default ProjectSidebar;

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import type { ProjectConfig } from "@/config";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import { usePersistedState } from "@/hooks/usePersistedState";
import { DndProvider } from "react-dnd";
import { HTML5Backend, getEmptyImage } from "react-dnd-html5-backend";
import { useDrag, useDrop, useDragLayer } from "react-dnd";
import { sortProjectsByOrder, reorderProjects, normalizeOrder } from "@/utils/projectOrdering";
import { matchesKeybind, formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";
import { abbreviatePath } from "@/utils/ui/pathAbbreviation";
import {
  partitionWorkspacesByAge,
  formatOldWorkspaceThreshold,
} from "@/utils/ui/workspaceFiltering";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import SecretsModal from "./SecretsModal";
import type { Secret } from "@/types/secrets";
import { ForceDeleteModal } from "./ForceDeleteModal";
import { WorkspaceListItem, type WorkspaceSelection } from "./WorkspaceListItem";
import { RenameProvider } from "@/contexts/WorkspaceRenameContext";

// Re-export WorkspaceSelection for backwards compatibility
export type { WorkspaceSelection } from "./WorkspaceListItem";

// Draggable project item moved to module scope to avoid remounting on every parent render.
// Defining components inside another component causes a new function identity each render,
// which forces React to unmount/remount the subtree. That led to hover flicker and high CPU.
type DraggableProjectItemProps = React.PropsWithChildren<{
  projectPath: string;
  onReorder: (draggedPath: string, targetPath: string) => void;
  selected?: boolean;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  role?: string;
  tabIndex?: number;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "data-project-path"?: string;
}>;

const DraggableProjectItemBase: React.FC<DraggableProjectItemProps> = ({
  projectPath,
  onReorder,
  children,
  ...rest
}) => {
  const [{ isDragging }, drag, dragPreview] = useDrag(
    () => ({
      type: "PROJECT",
      item: { projectPath },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [projectPath]
  );

  // Hide native drag preview; we render a custom preview via DragLayer
  useEffect(() => {
    dragPreview(getEmptyImage(), { captureDraggingState: true });
  }, [dragPreview]);

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: "PROJECT",
      drop: (item: { projectPath: string }) => {
        if (item.projectPath !== projectPath) {
          onReorder(item.projectPath, projectPath);
        }
      },
      collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
    }),
    [projectPath, onReorder]
  );

  return (
    <ProjectItem ref={(node) => drag(drop(node))} isDragging={isDragging} isOver={isOver} {...rest}>
      {children}
    </ProjectItem>
  );
};

const DraggableProjectItem = React.memo(
  DraggableProjectItemBase,
  (prev, next) =>
    prev.projectPath === next.projectPath &&
    prev.onReorder === next.onReorder &&
    (prev["aria-expanded"] ?? false) === (next["aria-expanded"] ?? false)
);

// Custom drag layer to show a semi-transparent preview and enforce grabbing cursor
type DragItem = { projectPath: string } | null;

const ProjectDragLayer: React.FC = () => {
  const dragState = useDragLayer<{
    isDragging: boolean;
    item: unknown;
    currentOffset: { x: number; y: number } | null;
  }>((monitor) => ({
    isDragging: monitor.isDragging(),
    item: monitor.getItem(),
    currentOffset: monitor.getClientOffset(),
  }));
  const isDragging = dragState.isDragging;
  const item = dragState.item as DragItem;
  const currentOffset = dragState.currentOffset;

  React.useEffect(() => {
    if (!isDragging) return;
    const originalBody = document.body.style.cursor;
    const originalHtml = document.documentElement.style.cursor;
    document.body.style.cursor = "grabbing";
    document.documentElement.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = originalBody;
      document.documentElement.style.cursor = originalHtml;
    };
  }, [isDragging]);

  if (!isDragging || !currentOffset || !item?.projectPath) return null;

  const name = item.projectPath.split("/").pop() ?? item.projectPath;
  const abbrevPath = abbreviatePath(item.projectPath);

  return (
    <DragLayerContainer style={{ cursor: "grabbing" }}>
      <div style={{ transform: `translate(${currentOffset.x + 10}px, ${currentOffset.y + 10}px)` }}>
        <DragPreviewItem>
          <span style={{ marginRight: 6, color: "#666", fontSize: 12 }}>⠿</span>
          <span style={{ marginRight: 8, color: "#888", fontSize: 10 }}>▶</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: "#cccccc",
                fontSize: 14,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {name}
            </div>
            <div
              style={{
                color: "#6e6e6e",
                fontSize: 11,
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontFamily: "var(--font-monospace)",
              }}
            >
              {abbrevPath}
            </div>
          </div>
        </DragPreviewItem>
      </div>
    </DragLayerContainer>
  );
};

interface ProjectSidebarProps {
  projects: Map<string, ProjectConfig>;
  workspaceMetadata: Map<string, FrontendWorkspaceMetadata>;
  selectedWorkspace: WorkspaceSelection | null;
  onSelectWorkspace: (selection: WorkspaceSelection) => void;
  onAddProject: () => void;
  onAddWorkspace: (projectPath: string) => void;
  onRemoveProject: (path: string) => void;
  onRemoveWorkspace: (
    workspaceId: string,
    options?: { force?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
  onRenameWorkspace: (
    workspaceId: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string }>;
  lastReadTimestamps: Record<string, number>;
  onToggleUnread: (workspaceId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onGetSecrets: (projectPath: string) => Promise<Secret[]>;
  onUpdateSecrets: (projectPath: string, secrets: Secret[]) => Promise<void>;
  sortedWorkspacesByProject: Map<string, FrontendWorkspaceMetadata[]>;
  workspaceRecency: Record<string, number>;
}

const ProjectSidebarInner: React.FC<ProjectSidebarProps> = ({
  projects,
  selectedWorkspace,
  onSelectWorkspace,
  onAddProject,
  onAddWorkspace,
  onRemoveProject,
  onRemoveWorkspace,
  onRenameWorkspace,
  lastReadTimestamps,
  onToggleUnread: _onToggleUnread,
  collapsed,
  onToggleCollapsed,
  onGetSecrets,
  onUpdateSecrets,
  sortedWorkspacesByProject,
  workspaceRecency,
}) => {
  // Workspace-specific subscriptions moved to WorkspaceListItem component

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

  // Track which projects have old workspaces expanded (per-project)
  const [expandedOldWorkspaces, setExpandedOldWorkspaces] = usePersistedState<
    Record<string, boolean>
  >("expandedOldWorkspaces", {});
  const [removeError, setRemoveError] = useState<{
    workspaceId: string;
    error: string;
    position: { top: number; left: number };
  } | null>(null);
  const removeErrorTimeoutRef = useRef<number | null>(null);
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
    anchor: { top: number; left: number } | null;
  } | null>(null);

  const getProjectName = (path: string) => {
    if (!path || typeof path !== "string") {
      return "Unknown";
    }
    return path.split("/").pop() ?? path.split("\\").pop() ?? path;
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

  const toggleOldWorkspaces = (projectPath: string) => {
    setExpandedOldWorkspaces((prev) => ({
      ...prev,
      [projectPath]: !prev[projectPath],
    }));
  };

  const showRemoveError = useCallback(
    (workspaceId: string, error: string, anchor?: { top: number; left: number }) => {
      if (removeErrorTimeoutRef.current) {
        window.clearTimeout(removeErrorTimeoutRef.current);
      }

      const position = anchor ?? {
        top: window.scrollY + 32,
        left: Math.max(window.innerWidth - 420, 16),
      };

      setRemoveError({
        workspaceId,
        error,
        position,
      });

      removeErrorTimeoutRef.current = window.setTimeout(() => {
        setRemoveError(null);
        removeErrorTimeoutRef.current = null;
      }, 5000);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (removeErrorTimeoutRef.current) {
        window.clearTimeout(removeErrorTimeoutRef.current);
      }
    };
  }, []);

  const handleRemoveWorkspace = useCallback(
    async (workspaceId: string, buttonElement: HTMLElement) => {
      const result = await onRemoveWorkspace(workspaceId);
      if (!result.success) {
        const error = result.error ?? "Failed to remove workspace";
        const rect = buttonElement.getBoundingClientRect();
        const anchor = {
          top: rect.top + window.scrollY,
          left: rect.right + 10, // 10px to the right of button
        };

        // Show force delete modal on any error to handle all cases
        // (uncommitted changes, submodules, etc.)
        setForceDeleteModal({
          isOpen: true,
          workspaceId,
          error,
          anchor,
        });
      }
    },
    [onRemoveWorkspace]
  );

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
    const modalState = forceDeleteModal;
    // Close modal immediately to show that action is in progress
    setForceDeleteModal(null);

    // Use the same state update logic as regular removal
    const result = await onRemoveWorkspace(workspaceId, { force: true });
    if (!result.success) {
      const errorMessage = result.error ?? "Failed to remove workspace";
      console.error("Force delete failed:", result.error);

      showRemoveError(workspaceId, errorMessage, modalState?.anchor ?? undefined);
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

  // UI preference: project order persists in localStorage
  const [projectOrder, setProjectOrder] = usePersistedState<string[]>("cmux:projectOrder", []);

  // Build a stable signature of the project keys so effects don't fire on Map identity churn
  const projectPathsSignature = React.useMemo(() => {
    // sort to avoid order-related churn
    const keys = Array.from(projects.keys()).sort();
    return keys.join("\u0001"); // use non-printable separator
  }, [projects]);

  // Normalize order when the set of projects changes (not on every parent render)
  useEffect(() => {
    // Skip normalization if projects haven't loaded yet (empty Map on initial render)
    // This prevents clearing projectOrder before projects load from backend
    if (projects.size === 0) {
      return;
    }

    const normalized = normalizeOrder(projectOrder, projects);
    if (
      normalized.length !== projectOrder.length ||
      normalized.some((p, i) => p !== projectOrder[i])
    ) {
      setProjectOrder(normalized);
    }
    // Only re-run when project keys change (projectPathsSignature captures projects Map keys)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPathsSignature]);

  // Memoize sorted project PATHS (not entries) to avoid capturing stale config objects.
  // Sorting depends only on keys + order; we read configs from the live Map during render.
  const sortedProjectPaths = React.useMemo(
    () => sortProjectsByOrder(projects, projectOrder).map(([p]) => p),
    // projectPathsSignature captures projects Map keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectPathsSignature, projectOrder]
  );

  const handleReorder = useCallback(
    (draggedPath: string, targetPath: string) => {
      const next = reorderProjects(projectOrder, projects, draggedPath, targetPath);
      setProjectOrder(next);
    },
    [projectOrder, projects, setProjectOrder]
  );

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
    <RenameProvider onRenameWorkspace={onRenameWorkspace}>
      <DndProvider backend={HTML5Backend}>
        <ProjectDragLayer />
<<<<<<< HEAD
        <SidebarContent role="navigation" aria-label="Projects">
          {!collapsed && (
            <>
              <SidebarHeader>
                <h2>Projects</h2>
                <TooltipWrapper inline>
                  <AddProjectBtn onClick={onAddProject} aria-label="Add project">
                    +
                  </AddProjectBtn>
                  <Tooltip className="tooltip" align="right">
                    Add Project
                  </Tooltip>
                </TooltipWrapper>
              </SidebarHeader>
              <ProjectsList>
=======
        <div
          className="flex flex-col flex-1 overflow-hidden font-primary"
          role="navigation"
          aria-label="Projects"
        >
          {!collapsed && (
            <>
              <div className="flex justify-between items-center p-4 border-b border-[#1e1e1e]">
                <h2 className="m-0 text-[13px] font-semibold text-[#cccccc] uppercase tracking-[0.8px]">
                  Projects
                </h2>
                <button
                  onClick={onAddProject}
                  title="Add Project"
                  aria-label="Add project"
                  className="w-6 h-6 bg-transparent text-[#cccccc] border border-transparent rounded cursor-pointer text-lg flex items-center justify-center p-0 transition-all duration-200 hover:bg-[#2a2a2b] hover:border-[#3c3c3c]"
                >
                  +
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
>>>>>>> 6778c48 (🤖 fix: Restore properly converted Tailwind files after rebase)
                {projects.size === 0 ? (
                  <EmptyState>
                    <p>No projects</p>
                    <AddFirstProjectBtn onClick={onAddProject}>Add Project</AddFirstProjectBtn>
                  </EmptyState>
                ) : (
                  sortedProjectPaths.map((projectPath) => {
                    const config = projects.get(projectPath);
                    if (!config) return null;
                    const projectName = getProjectName(projectPath);
                    const sanitizedProjectId =
                      projectPath.replace(/[^a-zA-Z0-9_-]/g, "-") || "root";
                    const workspaceListId = `workspace-list-${sanitizedProjectId}`;
                    const isExpanded = expandedProjects.has(projectPath);

                    return (
                      <ProjectGroup key={projectPath}>
                        <DraggableProjectItem
                          projectPath={projectPath}
                          onReorder={handleReorder}
                          onClick={() => toggleProject(projectPath)}
                          onKeyDown={(e: React.KeyboardEvent) => {
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
                          <DragHandle data-drag-handle aria-hidden>
                            ⠿
                          </DragHandle>
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
                        </DraggableProjectItem>

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
                            {(() => {
                              const allWorkspaces =
                                sortedWorkspacesByProject.get(projectPath) ?? [];
                              const { recent, old } = partitionWorkspacesByAge(
                                allWorkspaces,
                                workspaceRecency
                              );
                              const showOldWorkspaces = expandedOldWorkspaces[projectPath] ?? false;

                              const renderWorkspace = (metadata: FrontendWorkspaceMetadata) => (
                                <WorkspaceListItem
                                  key={metadata.id}
                                  metadata={metadata}
                                  projectPath={projectPath}
                                  projectName={projectName}
                                  isSelected={selectedWorkspace?.workspaceId === metadata.id}
                                  lastReadTimestamp={lastReadTimestamps[metadata.id] ?? 0}
                                  onSelectWorkspace={onSelectWorkspace}
                                  onRemoveWorkspace={handleRemoveWorkspace}
                                  onToggleUnread={_onToggleUnread}
                                />
                              );

                              return (
                                <>
                                  {recent.map(renderWorkspace)}
                                  {old.length > 0 && (
                                    <>
                                      <OldWorkspacesSection
                                        onClick={() => toggleOldWorkspaces(projectPath)}
                                        aria-label={
                                          showOldWorkspaces
                                            ? `Collapse workspaces older than ${formatOldWorkspaceThreshold()}`
                                            : `Expand workspaces older than ${formatOldWorkspaceThreshold()}`
                                        }
                                        aria-expanded={showOldWorkspaces}
                                        expanded={showOldWorkspaces}
                                      >
                                        <div className="label">
                                          <span>Older than {formatOldWorkspaceThreshold()}</span>
<<<<<<< HEAD
                                          <span className="count">({old.length})</span>
                                        </div>
                                        <span className="arrow">▶</span>
                                      </OldWorkspacesSection>
=======
                                          <span className="text-[#666] font-normal">
                                            ({old.length})
                                          </span>
                                        </div>
                                        <span
                                          className="arrow text-[11px] text-[#666] transition-transform duration-200 ease-in-out"
                                          style={{
                                            transform: showOldWorkspaces
                                              ? "rotate(90deg)"
                                              : "rotate(0deg)",
                                          }}
                                        >
                                          ▶
                                        </span>
                                      </button>
>>>>>>> 6778c48 (🤖 fix: Restore properly converted Tailwind files after rebase)
                                      {showOldWorkspaces && old.map(renderWorkspace)}
                                    </>
                                  )}
                                </>
                              );
                            })()}
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
      </DndProvider>
    </RenameProvider>
  );
};

// Memoize to prevent re-renders when props haven't changed
const ProjectSidebar = React.memo(ProjectSidebarInner);

export default ProjectSidebar;

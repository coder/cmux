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

const ProjectItem = styled.div<{ selected?: boolean; isDragging?: boolean; isOver?: boolean }>`
  padding: 4px 12px;
  cursor: ${(props) => (props.isDragging ? "grabbing" : "grab")};
  display: flex;
  align-items: center;
  border-left: 3px solid transparent;
  transition: all 0.15s;
  opacity: ${(props) => (props.isDragging ? 0.4 : 1)};
  background: ${(props) => (props.isOver ? "rgba(0, 122, 204, 0.08)" : "transparent")};

  ${(props) =>
    props.selected &&
    css`
      background: #2a2a2b;
      border-left-color: #007acc;
    `}

  ${(props) =>
    props.isDragging &&
    css`
      * {
        cursor: grabbing !important;
      }
    `}

  &:hover {
    background: #2a2a2b;

    button {
      opacity: 1;
    }

    /* Show drag handle on hover - target by data attribute */
    [data-drag-handle] {
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

// Global DnD drag layer to render a semi-transparent preview of the dragged project
const DragLayerContainer = styled.div`
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

const DragPreviewItem = styled.div`
  background: rgba(42, 42, 43, 0.95);
  color: #ccc;
  padding: 6px 12px;
  border-left: 3px solid #007acc;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  border-radius: 4px;
  display: flex;
  align-items: center;
  width: fit-content;
  max-width: 280px;
  min-width: 180px;
`;

const DragHandle = styled.span`
  color: #666;
  font-size: 12px;
  margin-right: 6px;
  cursor: grab;
  opacity: 0;
  user-select: none;
  transition: opacity 0.15s;
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
  margin-top: 1px;
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

const OldWorkspacesSection = styled.button<{ expanded: boolean }>`
  width: 100%;
  padding: 8px 12px 8px 22px;
  background: transparent;
  color: #858585;
  border: none;
  border-top: 1px solid #2a2a2b;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 500;

  &:hover {
    background: rgba(255, 255, 255, 0.03);
    color: #aaa;

    .arrow {
      color: #aaa;
    }
  }

  .label {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .count {
    color: #666;
    font-weight: 400;
  }

  .arrow {
    font-size: 11px;
    color: #666;
    transition: transform 0.2s ease;
    transform: ${(props) => (props.expanded ? "rotate(90deg)" : "rotate(0deg)")};
  }
`;

const RemoveErrorToast = styled.div<{ top: number; left: number }>`
  position: fixed;
  top: ${(props) => props.top}px;
  left: ${(props) => props.left}px;
  max-width: min(400px, calc(100vw - 40px));
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
                                          <span className="count">({old.length})</span>
                                        </div>
                                        <span className="arrow">▶</span>
                                      </OldWorkspacesSection>
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

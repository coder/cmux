import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
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
  selected,
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
    <div
      ref={(node) => drag(drop(node))}
      className={cn(
        "py-1 px-3 flex items-center border-l-[3px] border-l-transparent transition-all duration-150",
        isDragging ? "cursor-grabbing opacity-40 [&_*]:!cursor-grabbing" : "cursor-grab",
        isOver && "bg-[rgba(0,122,204,0.08)]",
        selected && "bg-[#2a2a2b] border-l-[#007acc]",
        "hover:bg-[#2a2a2b] hover:[&_button]:opacity-100 hover:[&_[data-drag-handle]]:opacity-100"
      )}
      {...rest}
    >
      {children}
    </div>
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
    <div className="fixed pointer-events-none z-[9999] inset-0 cursor-grabbing">
      <div style={{ transform: `translate(${currentOffset.x + 10}px, ${currentOffset.y + 10}px)` }}>
        <div className="bg-[rgba(42,42,43,0.95)] text-[#ccc] py-1.5 px-3 border-l-[3px] border-l-[#007acc] shadow-[0_6px_24px_rgba(0,0,0,0.4)] rounded flex items-center w-fit max-w-[280px] min-w-[180px]">
          <span className="mr-1.5 text-[#666] text-xs">⠿</span>
          <span className="mr-2 text-[#888] text-[10px]">▶</span>
          <div className="flex-1 min-w-0">
            <div className="text-[#cccccc] text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis tracking-[0.2px]">
              {name}
            </div>
            <div className="text-[#6e6e6e] text-[11px] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis font-monospace">
              {abbrevPath}
            </div>
          </div>
        </div>
      </div>
    </div>
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
        <div className="flex flex-col flex-1 overflow-hidden font-primary" role="navigation" aria-label="Projects">
          {!collapsed && (
            <>
              <div className="flex justify-between items-center p-4 border-b border-[#1e1e1e]">
                <h2 className="m-0 text-[13px] font-semibold text-[#cccccc] uppercase tracking-[0.8px]">Projects</h2>
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
                {projects.size === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <p className="text-[#888] text-[13px] mb-4">No projects</p>
                    <button
                      onClick={onAddProject}
                      className="bg-[#007acc] text-white border-none rounded py-2 px-4 text-[13px] cursor-pointer transition-colors duration-200 hover:bg-[#005a9e]"
                    >
                      Add Project
                    </button>
                  </div>
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
                      <div key={projectPath} className="border-b border-[#2a2a2b]">
                        <DraggableProjectItem
                          projectPath={projectPath}
                          onReorder={handleReorder}
                          selected={false}
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
                          <span
                            data-drag-handle
                            aria-hidden
                            className="text-[#666] text-xs mr-1.5 cursor-grab opacity-0 select-none transition-opacity duration-150"
                          >
                            ⠿
                          </span>
                          <span
                            data-project-path={projectPath}
                            aria-hidden="true"
                            className="text-[#888] text-[10px] mr-2 transition-transform duration-200 flex-shrink-0"
                            style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                          >
                            ▶
                          </span>
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="text-[#cccccc] text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis tracking-[0.2px]">
                              {projectName}
                            </div>
                            <TooltipWrapper inline>
                              <div className="text-[#6e6e6e] text-[11px] mt-px whitespace-nowrap overflow-hidden text-ellipsis font-monospace">
                                {abbreviatePath(projectPath)}
                              </div>
                              <Tooltip className="tooltip" align="left">
                                {projectPath}
                              </Tooltip>
                            </TooltipWrapper>
                          </div>
                          <TooltipWrapper inline>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleOpenSecrets(projectPath);
                              }}
                              aria-label={`Manage secrets for ${projectName}`}
                              data-project-path={projectPath}
                              className="w-5 h-5 bg-transparent text-[#6e6e6e] border-none rounded-[3px] cursor-pointer text-sm flex items-center justify-center transition-all duration-200 opacity-0 flex-shrink-0 mr-1 hover:text-[#569cd6] hover:bg-[rgba(86,156,214,0.1)]"
                            >
                              🔑
                            </button>
                            <Tooltip className="tooltip" align="right">
                              Manage secrets
                            </Tooltip>
                          </TooltipWrapper>
                          <TooltipWrapper inline>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                onRemoveProject(projectPath);
                              }}
                              title="Remove project"
                              aria-label={`Remove project ${projectName}`}
                              data-project-path={projectPath}
                              className="w-5 h-5 bg-transparent text-[#6e6e6e] border-none rounded-[3px] cursor-pointer text-base flex items-center justify-center transition-all duration-200 opacity-0 flex-shrink-0 hover:text-[#ff5555] hover:bg-[rgba(255,85,85,0.1)]"
                            >
                              ×
                            </button>
                            <Tooltip className="tooltip" align="right">
                              Remove project
                            </Tooltip>
                          </TooltipWrapper>
                        </DraggableProjectItem>

                        {isExpanded && (
                          <div id={workspaceListId} className="bg-[#1a1a1a]">
                            <div className="py-2 px-3 pl-[22px] border-b border-[#2a2a2b]">
                              <button
                                onClick={() => onAddWorkspace(projectPath)}
                                data-project-path={projectPath}
                                aria-label={`Add workspace to ${projectName}`}
                                className="w-full py-1.5 px-3 bg-transparent text-[#888] border border-dashed border-[#444] rounded cursor-pointer text-[13px] transition-all duration-200 text-left hover:bg-[#2a2a2b] hover:border-[#555] hover:text-[#ccc]"
                              >
                                + New Workspace
                                {selectedWorkspace?.projectPath === projectPath &&
                                  ` (${formatKeybind(KEYBINDS.NEW_WORKSPACE)})`}
                              </button>
                            </div>
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
                                      <button
                                        onClick={() => toggleOldWorkspaces(projectPath)}
                                        aria-label={
                                          showOldWorkspaces
                                            ? `Collapse workspaces older than ${formatOldWorkspaceThreshold()}`
                                            : `Expand workspaces older than ${formatOldWorkspaceThreshold()}`
                                        }
                                        aria-expanded={showOldWorkspaces}
                                        className="w-full py-2 px-3 pl-[22px] bg-transparent text-[#858585] border-none border-t border-t-[#2a2a2b] cursor-pointer text-xs transition-all duration-150 flex items-center justify-between font-medium hover:bg-[rgba(255,255,255,0.03)] hover:text-[#aaa] [&:hover_.arrow]:text-[#aaa]"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span>Older than {formatOldWorkspaceThreshold()}</span>
                                          <span className="text-[#666] font-normal">({old.length})</span>
                                        </div>
                                        <span
                                          className="arrow text-[11px] text-[#666] transition-transform duration-200 ease-in-out"
                                          style={{ transform: showOldWorkspaces ? "rotate(90deg)" : "rotate(0deg)" }}
                                        >
                                          ▶
                                        </span>
                                      </button>
                                      {showOldWorkspaces && old.map(renderWorkspace)}
                                    </>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
          <TooltipWrapper inline>
            <button
              onClick={onToggleCollapsed}
              className="w-full h-9 bg-transparent text-[#888] border-none border-t border-t-[#1e1e1e] cursor-pointer text-sm flex items-center justify-center p-0 transition-all duration-200 mt-auto hover:bg-[#2a2a2b] hover:text-[#ccc]"
            >
              {collapsed ? "»" : "«"}
            </button>
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
              <div
                className="fixed max-w-[400px] p-3 px-4 bg-error-bg border border-error rounded-md text-error text-xs z-[10000] shadow-[0_4px_16px_rgba(0,0,0,0.5)] font-monospace leading-[1.4] whitespace-pre-wrap break-words pointer-events-auto"
                style={{
                  top: `${removeError.position.top}px`,
                  left: `${removeError.position.left}px`,
                }}
              >
                Failed to remove workspace: {removeError.error}
              </div>,
              document.body
            )}
        </div>
      </DndProvider>
    </RenameProvider>
  );
};

// Memoize to prevent re-renders when props haven't changed
const ProjectSidebar = React.memo(ProjectSidebarInner);

export default ProjectSidebar;

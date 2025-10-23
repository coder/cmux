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
        "py-1 px-3 flex items-center border-l-transparent transition-all duration-150 bg-neutral-800",
        isDragging ? "cursor-grabbing opacity-40 [&_*]:!cursor-grabbing" : "cursor-grab",
        isOver && "bg-sky-600/[0.08]",
        selected && "bg-neutral-800 border-l-accent",
        "hover:bg-neutral-800 hover:[&_button]:opacity-100 hover:[&_[data-drag-handle]]:opacity-100"
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
    <div className="pointer-events-none fixed inset-0 z-[9999] cursor-grabbing">
      <div style={{ transform: `translate(${currentOffset.x + 10}px, ${currentOffset.y + 10}px)` }}>
        <div className="border-l-accent flex w-fit max-w-72 min-w-44 items-center rounded border-l-[3px] bg-neutral-800/95 px-3 py-1.5 text-neutral-300 shadow-[0_6px_24px_rgba(0,0,0,0.4)]">
          <span className="mr-1.5 text-xs text-neutral-400">⠿</span>
          <span className="mr-2 text-[10px] text-neutral-400">▶</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium tracking-[0.2px] text-neutral-300">
              {name}
            </div>
            <div className="font-monospace mt-0.5 truncate text-[11px] text-neutral-400">
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
        <div
          className="font-primary flex flex-1 flex-col overflow-hidden border-r border-neutral-800 bg-neutral-800"
          role="navigation"
          aria-label="Projects"
        >
          {!collapsed && (
            <>
              <div className="flex items-center justify-between border-b border-neutral-950 bg-neutral-800 p-4">
                <h2 className="m-0 text-[13px] font-semibold tracking-[0.8px] text-neutral-300 uppercase">
                  Projects
                </h2>
                <TooltipWrapper inline>
                  <button
                    onClick={onAddProject}
                    aria-label="Add project"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-transparent bg-transparent p-0 text-lg text-neutral-300 transition-all duration-200 hover:border-neutral-800 hover:bg-neutral-800"
                  >
                    +
                  </button>
                  <Tooltip className="tooltip" align="right">
                    Add Project
                  </Tooltip>
                </TooltipWrapper>
              </div>
              <div className="flex-1 overflow-y-auto">
                {projects.size === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="mb-4 text-[13px] text-neutral-400">No projects</p>
                    <button
                      onClick={onAddProject}
                      className="hover:bg-sky-600-dark cursor-pointer rounded border-none bg-sky-600 px-4 py-2 text-[13px] text-white transition-colors duration-200"
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
                      <div key={projectPath} className="border-b border-neutral-900">
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
                            className="mr-1.5 cursor-grab text-xs text-neutral-400 opacity-0 transition-opacity duration-150 select-none"
                          >
                            ⠿
                          </span>
                          <span
                            data-project-path={projectPath}
                            aria-hidden="true"
                            className="mr-2 shrink-0 text-[10px] text-neutral-400 transition-transform duration-200"
                            style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                          >
                            ▶
                          </span>
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="truncate text-sm font-medium tracking-[0.2px] text-neutral-300">
                              {projectName}
                            </div>
                            <TooltipWrapper inline>
                              <div className="font-monospace mt-px truncate text-[11px] text-neutral-400">
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
                              className="mr-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border-none bg-transparent text-sm text-neutral-400 opacity-0 transition-all duration-200 hover:bg-sky-600/10 hover:text-sky-600"
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
                              className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border-none bg-transparent text-base text-neutral-400 opacity-0 transition-all duration-200 hover:bg-red-400/10 hover:text-red-400"
                            >
                              ×
                            </button>
                            <Tooltip className="tooltip" align="right">
                              Remove project
                            </Tooltip>
                          </TooltipWrapper>
                        </DraggableProjectItem>

                        {isExpanded && (
                          <div id={workspaceListId}>
                            <div className="border-b border-neutral-900 px-3 py-2 pl-[22px]">
                              <button
                                onClick={() => onAddWorkspace(projectPath)}
                                data-project-path={projectPath}
                                aria-label={`Add workspace to ${projectName}`}
                                className="hover:border-neutral-800-darker w-full cursor-pointer rounded border border-dashed border-neutral-700 bg-transparent px-3 py-1.5 text-left text-[13px] text-neutral-400 transition-all duration-200 hover:bg-neutral-800 hover:text-neutral-300"
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
                                        className="flex w-full cursor-pointer items-center justify-between border-t border-none border-neutral-900 bg-transparent px-3 py-2 pl-[22px] text-xs font-medium text-neutral-400 transition-all duration-150 hover:bg-white/[0.03] hover:text-neutral-400 [&:hover_.arrow]:text-neutral-400"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span>Older than {formatOldWorkspaceThreshold()}</span>
                                          <span className="font-normal text-neutral-400">
                                            ({old.length})
                                          </span>
                                        </div>
                                        <span
                                          className="arrow text-[11px] text-neutral-400 transition-transform duration-200 ease-in-out"
                                          style={{
                                            transform: showOldWorkspaces
                                              ? "rotate(90deg)"
                                              : "rotate(0deg)",
                                          }}
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
              className="mt-auto flex h-9 w-full cursor-pointer items-center justify-center border-t border-none border-neutral-950 bg-transparent p-0 text-sm text-neutral-400 transition-all duration-200 hover:bg-neutral-800 hover:text-neutral-300"
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
                className="bg-error-bg border-error text-error font-monospace pointer-events-auto fixed z-[10000] max-w-96 rounded-md border p-3 px-4 text-xs leading-[1.4] break-words whitespace-pre-wrap shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
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

import React, { useState, useCallback, useMemo } from "react";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import { useWorkspaceSidebarState } from "@/stores/WorkspaceStore";
import { useGitStatus } from "@/stores/GitStatusStore";
import { formatRelativeTime } from "@/utils/ui/dateTime";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { GitStatusIndicator } from "./GitStatusIndicator";
import { ModelDisplay } from "./Messages/ModelDisplay";
import { StatusIndicator } from "./StatusIndicator";
import { useRename } from "@/contexts/WorkspaceRenameContext";
import { cn } from "@/lib/utils";

export interface WorkspaceSelection {
  projectPath: string;
  projectName: string;
  namedWorkspacePath: string; // User-friendly path (symlink for new workspaces)
  workspaceId: string;
}
export interface WorkspaceListItemProps {
  // Workspace metadata passed directly
  metadata: FrontendWorkspaceMetadata;
  projectPath: string;
  projectName: string;
  isSelected: boolean;
  lastReadTimestamp: number;
  // Event handlers
  onSelectWorkspace: (selection: WorkspaceSelection) => void;
  onRemoveWorkspace: (workspaceId: string, button: HTMLElement) => Promise<void>;
  onToggleUnread: (workspaceId: string) => void;
}

const WorkspaceListItemInner: React.FC<WorkspaceListItemProps> = ({
  metadata,
  projectPath,
  projectName,
  isSelected,
  lastReadTimestamp,
  onSelectWorkspace,
  onRemoveWorkspace,
  onToggleUnread,
}) => {
  // Destructure metadata for convenience
  const { id: workspaceId, title, namedWorkspacePath } = metadata;
  // Subscribe to this specific workspace's sidebar state (streaming status, model, recency)
  const sidebarState = useWorkspaceSidebarState(workspaceId);
  const gitStatus = useGitStatus(workspaceId);

  // Get rename context
  const { editingWorkspaceId, requestRename, confirmRename, cancelRename } = useRename();

  // Local state for editing title
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [renameError, setRenameError] = useState<string | null>(null);

  // Display title if available, otherwise fall back to showing the workspace ID
  const displayName = title ?? workspaceId;
  const isStreaming = sidebarState.canInterrupt;
  const streamingModel = sidebarState.currentModel;
  const isEditing = editingWorkspaceId === workspaceId;

  // Compute unread status locally based on recency vs last read timestamp
  // Note: We don't check !isSelected here because user should be able to see
  // and toggle unread status even for the selected workspace
  const isUnread =
    sidebarState.recencyTimestamp !== null && sidebarState.recencyTimestamp > lastReadTimestamp;

  const startRenaming = () => {
    if (requestRename(workspaceId, displayName)) {
      setEditingTitle(displayName);
      setRenameError(null);
    }
  };

  const handleConfirmRename = async () => {
    // Empty title is OK - will fall back to showing ID
    const newTitle = editingTitle.trim();

    const result = await confirmRename(workspaceId, newTitle);
    if (!result.success) {
      setRenameError(result.error ?? "Failed to edit title");
    } else {
      setRenameError(null);
    }
  };

  const handleCancelRename = () => {
    cancelRename();
    setEditingTitle("");
    setRenameError(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleConfirmRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelRename();
    }
  };

  // Memoize toggle unread handler to prevent StatusIndicator re-renders
  const handleToggleUnread = useCallback(
    () => onToggleUnread(workspaceId),
    [onToggleUnread, workspaceId]
  );

  // Memoize tooltip title to prevent creating new React elements on every render
  const statusTooltipTitle = useMemo(() => {
    if (isStreaming && streamingModel) {
      return (
        <span>
          <ModelDisplay modelString={streamingModel} showTooltip={false} /> is responding
        </span>
      );
    }
    if (isStreaming) {
      return "Assistant is responding";
    }
    if (isUnread) {
      return "Unread messages";
    }
    if (sidebarState.recencyTimestamp) {
      return `Idle • Last used ${formatRelativeTime(sidebarState.recencyTimestamp)}`;
    }
    return "Idle";
  }, [isStreaming, streamingModel, isUnread, sidebarState.recencyTimestamp]);

  return (
    <React.Fragment>
      <div
        className={cn(
          "py-1.5 px-3 pl-7 cursor-pointer grid grid-cols-[auto_auto_1fr_auto] gap-2 items-center border-l-[3px] border-transparent transition-all duration-150 text-[13px] relative hover:bg-hover [&:hover_button]:opacity-100",
          isSelected && "bg-hover border-l-[#569cd6]"
        )}
        onClick={() =>
          onSelectWorkspace({
            projectPath,
            projectName,
            namedWorkspacePath,
            workspaceId,
          })
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectWorkspace({
              projectPath,
              projectName,
              namedWorkspacePath,
              workspaceId,
            });
          }
        }}
        role="button"
        tabIndex={0}
        aria-current={isSelected ? "true" : undefined}
        data-workspace-path={namedWorkspacePath}
        data-workspace-id={workspaceId}
      >
        <TooltipWrapper inline>
          <button
            className="opacity-0 bg-transparent text-muted border-none cursor-pointer text-base p-0 w-5 h-5 flex items-center justify-center transition-all duration-200 flex-shrink-0 col-start-1 hover:text-foreground hover:bg-white/10 hover:rounded-sm"
            onClick={(e) => {
              e.stopPropagation();
              void onRemoveWorkspace(workspaceId, e.currentTarget);
            }}
            aria-label={`Remove workspace ${displayName}`}
            data-workspace-id={workspaceId}
          >
            ×
          </button>
          <Tooltip className="tooltip" align="right">
            Remove workspace
          </Tooltip>
        </TooltipWrapper>
        <GitStatusIndicator
          gitStatus={gitStatus}
          workspaceId={workspaceId}
          tooltipPosition="right"
        />
        {isEditing ? (
          <WorkspaceNameInput
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={() => void handleConfirmRename()}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            aria-label={`Edit title for workspace ${displayName}`}
            data-workspace-id={workspaceId}
          />
        ) : (
          <span
            className="text-foreground text-[14px] whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer px-1 py-0.5 rounded-sm transition-colors duration-200 min-w-0 text-right hover:bg-white/5"
            onDoubleClick={(e) => {
              e.stopPropagation();
              startRenaming();
            }}
            title="Double-click to edit title"
          >
            {displayName}
          </span>
        )}
        <StatusIndicator
          className="ml-2"
          streaming={isStreaming}
          unread={isUnread}
          onClick={handleToggleUnread}
          title={statusTooltipTitle}
        />
      </div>
      {renameError && isEditing && (
        <div className="absolute top-full left-7 right-8 mt-1 px-2 py-1.5 bg-error-bg border border-error rounded-sm text-error text-xs z-10">
          {renameError}
        </div>
      )}
    </React.Fragment>
  );
};

export const WorkspaceListItem = React.memo(WorkspaceListItemInner);

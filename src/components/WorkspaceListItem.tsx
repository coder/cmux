import React, { useState, useCallback } from "react";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import { useGitStatus } from "@/stores/GitStatusStore";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { GitStatusIndicator } from "./GitStatusIndicator";
import { AgentStatusIndicator } from "./AgentStatusIndicator";
import { useRename } from "@/contexts/WorkspaceRenameContext";
import { cn } from "@/lib/utils";
import { RuntimeBadge } from "./RuntimeBadge";

export interface WorkspaceSelection {
  projectPath: string;
  projectName: string;
  namedWorkspacePath: string; // Worktree path (directory uses workspace name)
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
  const {
    id: workspaceId,
    name: workspaceName,
    displayName: displayTitle,
    namedWorkspacePath,
  } = metadata;
  const gitStatus = useGitStatus(workspaceId);

  // Get rename context
  const { editingWorkspaceId, requestRename, confirmRename, cancelRename } = useRename();

  // Local state for rename
  const [editingName, setEditingName] = useState<string>("");
  const [renameError, setRenameError] = useState<string | null>(null);

  // Prefer displayName (human-readable title) over name (branch name) for AI-generated workspaces
  const displayName = displayTitle ?? workspaceName;
  const isEditing = editingWorkspaceId === workspaceId;

  const startRenaming = () => {
    if (requestRename(workspaceId, displayName)) {
      setEditingName(displayName);
      setRenameError(null);
    }
  };

  const handleConfirmRename = async () => {
    if (!editingName.trim()) {
      setRenameError("Name cannot be empty");
      return;
    }

    const result = await confirmRename(workspaceId, editingName);
    if (!result.success) {
      setRenameError(result.error ?? "Failed to rename workspace");
    } else {
      setRenameError(null);
    }
  };

  const handleCancelRename = () => {
    cancelRename();
    setEditingName("");
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

  // Memoize toggle unread handler to prevent AgentStatusIndicator re-renders
  const handleToggleUnread = useCallback(
    () => onToggleUnread(workspaceId),
    [onToggleUnread, workspaceId]
  );

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
        aria-label={`Select workspace ${displayName}`}
        data-workspace-path={namedWorkspacePath}
        data-workspace-id={workspaceId}
      >
        <TooltipWrapper inline>
          <button
            className="text-muted hover:text-foreground col-start-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-base opacity-0 transition-all duration-200 hover:rounded-sm hover:bg-white/10"
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
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <RuntimeBadge runtimeConfig={metadata.runtimeConfig} />
          {isEditing ? (
            <input
              className="bg-input-bg text-input-text border-input-border font-inherit focus:border-input-border-focus min-w-0 rounded-sm border px-1 py-0.5 text-right text-[13px] outline-none"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => void handleConfirmRename()}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              aria-label={`Rename workspace ${displayName}`}
              data-workspace-id={workspaceId}
            />
          ) : (
            <span
              className="text-foreground min-w-0 cursor-pointer truncate rounded-sm px-1 py-0.5 text-right text-[14px] transition-colors duration-200 hover:bg-white/5"
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRenaming();
              }}
              title="Double-click to rename"
            >
              {displayName}
            </span>
          )}
        </div>
        <AgentStatusIndicator
          workspaceId={workspaceId}
          lastReadTimestamp={lastReadTimestamp}
          onClick={handleToggleUnread}
          className="ml-2"
        />
      </div>
      {renameError && isEditing && (
        <div className="bg-error-bg border-error text-error absolute top-full right-8 left-7 z-10 mt-1 rounded-sm border px-2 py-1.5 text-xs">
          {renameError}
        </div>
      )}
    </React.Fragment>
  );
};

export const WorkspaceListItem = React.memo(WorkspaceListItemInner);

import React, { useState, useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import { useWorkspaceSidebarState } from "@/stores/WorkspaceStore";
import { useGitStatus } from "@/stores/GitStatusStore";
import { formatRelativeTime } from "@/utils/ui/dateTime";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { GitStatusIndicator } from "./GitStatusIndicator";
import { ModelDisplay } from "./Messages/ModelDisplay";
import { StatusIndicator } from "./StatusIndicator";
import { useRename } from "@/contexts/WorkspaceRenameContext";

// Styled Components
const WorkspaceStatusIndicator = styled(StatusIndicator)`
  margin-left: 8px;
`;

const WorkspaceItem = styled.div<{ selected?: boolean }>`
  padding: 10px 16px 10px 32px;
  cursor: pointer;
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  gap: 12px;
  align-items: center;
  border-left: 2px solid transparent;
  transition: all 0.12s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 12px;
  position: relative;

  ${(props) =>
    props.selected &&
    css`
      background: hsl(0 0% 12%);
      border-left-color: hsl(207 100% 55%);
    `}

  &:hover {
    background: hsl(0 0% 11%);

    button {
      opacity: 1;
    }
  }

  /* Focus visible state for keyboard navigation */
  &:focus-visible {
    outline: 2px solid hsl(207 100% 55%);
    outline-offset: -2px;
  }
`;

const WorkspaceName = styled.span`
  color: hsl(0 0% 75%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 4px;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 0; /* Allow grid item to shrink below content size */
  text-align: right;
  font-weight: 500;
  letter-spacing: 0.01em;

  &:hover {
    background: hsl(0 0% 16%);
    color: hsl(0 0% 85%);
  }
`;

const WorkspaceNameInput = styled.input`
  background: var(--color-input-bg);
  color: var(--color-input-text);
  border: 1px solid var(--color-input-border);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  outline: none;
  min-width: 0; /* Allow grid item to shrink */
  text-align: right;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  &:focus {
    border-color: var(--color-input-border-focus);
    box-shadow: 0 0 0 3px hsl(from var(--color-input-border-focus) h s l / 0.1);
  }
`;

const WorkspaceErrorContainer = styled.div`
  position: absolute;
  top: 100%;
  left: 32px;
  right: 36px;
  margin-top: 6px;
  padding: 8px 10px;
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  border-radius: 6px;
  color: var(--color-error);
  font-size: 11px;
  line-height: 1.4;
  z-index: 10;
  box-shadow: 
    0 0 0 1px hsl(0 70% 50% / 0.2),
    0 4px 12px rgba(0, 0, 0, 0.4);
`;

const RemoveBtn = styled.button`
  opacity: 0;
  background: transparent;
  color: hsl(0 0% 45%);
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  border-radius: 5px;

  &:hover {
    color: hsl(0 70% 60%);
    background: hsl(0 70% 50% / 0.12);
  }

  &:active {
    transform: scale(0.9);
  }
`;

const WorkspaceRemoveBtn = styled(RemoveBtn)`
  grid-column: 1;
`;

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
  const { id: workspaceId, name: workspaceName, namedWorkspacePath } = metadata;
  // Subscribe to this specific workspace's sidebar state (streaming status, model, recency)
  const sidebarState = useWorkspaceSidebarState(workspaceId);
  const gitStatus = useGitStatus(workspaceId);

  // Get rename context
  const { editingWorkspaceId, requestRename, confirmRename, cancelRename } = useRename();

  // Local state for rename
  const [editingName, setEditingName] = useState<string>("");
  const [renameError, setRenameError] = useState<string | null>(null);

  // Use workspace name from metadata instead of deriving from path
  const displayName = workspaceName;
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
      <WorkspaceItem
        selected={isSelected}
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
          <WorkspaceRemoveBtn
            onClick={(e) => {
              e.stopPropagation();
              void onRemoveWorkspace(workspaceId, e.currentTarget);
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
          gitStatus={gitStatus}
          workspaceId={workspaceId}
          tooltipPosition="right"
        />
        {isEditing ? (
          <WorkspaceNameInput
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
          <WorkspaceName
            onDoubleClick={(e) => {
              e.stopPropagation();
              startRenaming();
            }}
            title="Double-click to rename"
          >
            {displayName}
          </WorkspaceName>
        )}
        <WorkspaceStatusIndicator
          streaming={isStreaming}
          unread={isUnread}
          onClick={handleToggleUnread}
          title={statusTooltipTitle}
        />
      </WorkspaceItem>
      {renameError && isEditing && <WorkspaceErrorContainer>{renameError}</WorkspaceErrorContainer>}
    </React.Fragment>
  );
};

export const WorkspaceListItem = React.memo(WorkspaceListItemInner);

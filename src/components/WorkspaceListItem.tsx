import React, { useState, useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { useWorkspaceSidebarState } from "@/stores/WorkspaceStore";
import { useGitStatus } from "@/stores/GitStatusStore";
import { formatRelativeTime } from "@/utils/ui/dateTime";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { GitStatusIndicator } from "./GitStatusIndicator";
import { ModelDisplay } from "./Messages/ModelDisplay";
import { StatusIndicator } from "./StatusIndicator";
import { useRename } from "@/contexts/WorkspaceRenameContext";

// Helper function to extract workspace display name from path
function getWorkspaceDisplayName(workspacePath: string): string {
  const pathParts = workspacePath.split("/");
  return pathParts[pathParts.length - 1] || "Unknown";
}

// Styled Components
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
  font-size: 12px;
  z-index: 10;
`;

const RemoveBtn = styled.button`
  opacity: 0;
  background: transparent;
  color: #888;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    color: #ccc;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }
`;

const WorkspaceRemoveBtn = styled(RemoveBtn)`
  grid-column: 1;
`;

export interface WorkspaceSelection {
  projectPath: string;
  projectName: string;
  workspacePath: string;
  workspaceId: string;
}
export interface WorkspaceListItemProps {
  // Minimal data - component accesses stores directly for the rest
  workspaceId: string;
  workspacePath: string;
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
  workspaceId,
  workspacePath,
  projectPath,
  projectName,
  isSelected,
  lastReadTimestamp,
  onSelectWorkspace,
  onRemoveWorkspace,
  onToggleUnread,
}) => {
  // Subscribe to this specific workspace's sidebar state (streaming status, model, recency)
  const sidebarState = useWorkspaceSidebarState(workspaceId);
  const gitStatus = useGitStatus(workspaceId);

  // Get rename context
  const { editingWorkspaceId, requestRename, confirmRename, cancelRename } = useRename();

  // Local state for rename
  const [editingName, setEditingName] = useState<string>("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const displayName = getWorkspaceDisplayName(workspacePath);
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
            workspacePath,
            workspaceId,
          })
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectWorkspace({
              projectPath,
              projectName,
              workspacePath,
              workspaceId,
            });
          }
        }}
        role="button"
        tabIndex={0}
        aria-current={isSelected ? "true" : undefined}
        data-workspace-path={workspacePath}
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

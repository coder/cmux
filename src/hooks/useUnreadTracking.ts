import { useState, useEffect, useCallback, useMemo } from "react";
import type { WorkspaceSelection } from "@/components/ProjectSidebar";
import type { WorkspaceState } from "./useWorkspaceAggregators";
import { getLastReadKey } from "@/constants/storage";

/**
 * Hook to track unread message status for all workspaces.
 * 
 * Automatically marks workspaces as read when:
 * - User switches to a workspace
 * - A stream completes in the currently selected workspace
 * 
 * Also supports manual toggling via the returned toggle function.
 * 
 * @returns {Object} Object containing:
 *   - unreadStatus: Map<workspaceId, boolean> indicating unread state
 *   - toggleUnread: Function to manually toggle unread state for a workspace
 */
export function useUnreadTracking(
  selectedWorkspace: WorkspaceSelection | null,
  workspaceStates: Map<string, WorkspaceState>
) {
  // Track component update counter to force re-calculation
  const [updateCounter, setUpdateCounter] = useState(0);

  // Mark workspace as read by storing current timestamp
  const markAsRead = useCallback((workspaceId: string) => {
    localStorage.setItem(getLastReadKey(workspaceId), Date.now().toString());
    setUpdateCounter((c) => c + 1);
  }, []);

  // Get the last-read timestamp for a workspace
  const getLastRead = useCallback((workspaceId: string): number => {
    const stored = localStorage.getItem(getLastReadKey(workspaceId));
    return stored ? parseInt(stored, 10) : 0;
  }, []);

  // Mark workspace as read when user switches to it
  useEffect(() => {
    if (selectedWorkspace) {
      markAsRead(selectedWorkspace.workspaceId);
    }
  }, [selectedWorkspace?.workspaceId, markAsRead]);

  // Mark workspace as read when stream completes in the selected workspace
  useEffect(() => {
    if (!selectedWorkspace) return;

    const state = workspaceStates.get(selectedWorkspace.workspaceId);
    if (state && !state.canInterrupt && state.messages.length > 0) {
      // Stream just finished - mark as read
      // Only do this if there are messages (prevents marking empty workspace as read)
      markAsRead(selectedWorkspace.workspaceId);
    }
  }, [selectedWorkspace, workspaceStates, markAsRead]);

  // Calculate unread status for all workspaces
  const unreadStatus = useMemo(() => {
    const result = new Map<string, boolean>();

    for (const [workspaceId, state] of workspaceStates) {
      // Currently selected workspace is never unread
      if (workspaceId === selectedWorkspace?.workspaceId) {
        result.set(workspaceId, false);
        continue;
      }

      // Streaming workspaces are never unread
      if (state.canInterrupt) {
        result.set(workspaceId, false);
        continue;
      }

      // Check if there are any assistant messages newer than last-read timestamp
      const lastRead = getLastRead(workspaceId);
      const hasUnread = state.messages.some(
        (msg) => msg.type === "assistant" && (msg.timestamp ?? 0) > lastRead
      );

      result.set(workspaceId, hasUnread);
    }

    return result;
  }, [workspaceStates, selectedWorkspace, getLastRead, updateCounter]);

  // Manual toggle function for clicking the indicator
  const toggleUnread = useCallback(
    (workspaceId: string) => {
      const isCurrentlyUnread = unreadStatus.get(workspaceId) ?? false;

      if (isCurrentlyUnread) {
        // Mark as read
        markAsRead(workspaceId);
      } else {
        // Mark as unread by setting timestamp to 0 (older than any message)
        localStorage.setItem(getLastReadKey(workspaceId), "0");
        setUpdateCounter((c) => c + 1);
      }
    },
    [unreadStatus, markAsRead]
  );

  return {
    unreadStatus,
    toggleUnread,
  };
}

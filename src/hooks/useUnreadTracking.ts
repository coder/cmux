import { useEffect, useCallback, useRef } from "react";
import type { WorkspaceSelection } from "@/components/ProjectSidebar";
import type { WorkspaceState } from "./useWorkspaceAggregators";
import { usePersistedState } from "./usePersistedState";
import { useStableReference, compareMaps } from "./useStableReference";

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
  // Store all last-read timestamps in a single Record
  // Format: { [workspaceId]: timestamp }
  const [lastReadMap, setLastReadMap] = usePersistedState<Record<string, number>>(
    "workspaceLastRead",
    {},
    { listener: true } // Enable cross-component/tab sync
  );

  // Track previous streaming state to detect when stream completes
  const prevStreamingRef = useRef<Map<string, boolean>>(new Map());

  // Mark workspace as read by storing current timestamp
  const markAsRead = useCallback(
    (workspaceId: string) => {
      setLastReadMap((prev) => ({
        ...prev,
        [workspaceId]: Date.now(),
      }));
    },
    [setLastReadMap]
  );

  // Mark workspace as read when user switches to it
  useEffect(() => {
    if (selectedWorkspace) {
      markAsRead(selectedWorkspace.workspaceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspace?.workspaceId, markAsRead]);

  // Mark workspace as read when stream completes in the selected workspace
  useEffect(() => {
    if (!selectedWorkspace) return;

    const workspaceId = selectedWorkspace.workspaceId;
    const state = workspaceStates.get(workspaceId);

    if (state) {
      const wasStreaming = prevStreamingRef.current.get(workspaceId) ?? false;
      const isStreaming = state.canInterrupt;

      // Only mark as read when transitioning from streaming→idle
      if (wasStreaming && !isStreaming && state.messages.length > 0) {
        markAsRead(workspaceId);
      }

      // Update tracking state
      prevStreamingRef.current.set(workspaceId, isStreaming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspace?.workspaceId, workspaceStates, markAsRead]);

  // Calculate unread status for all workspaces
  // Use stable reference to prevent unnecessary re-renders when values haven't changed
  const unreadStatus = useStableReference(
    () => {
      const map = new Map<string, boolean>();

      for (const [workspaceId, state] of workspaceStates) {
        // Streaming workspaces are never unread
        if (state.canInterrupt) {
          map.set(workspaceId, false);
          continue;
        }

        // Check for any assistant-originated content newer than last-read timestamp:
        // assistant text, tool calls/results (e.g., propose_plan), reasoning, and errors.
        // Exclude user's own messages and UI markers.
        const lastRead = lastReadMap[workspaceId] ?? 0;
        const hasUnread = state.messages.some(
          (msg) =>
            msg.type !== "user" && msg.type !== "history-hidden" && (msg.timestamp ?? 0) > lastRead
        );

        map.set(workspaceId, hasUnread);
      }

      return map;
    },
    compareMaps,
    [workspaceStates, lastReadMap]
  );

  // Manual toggle function for clicking the indicator
  const toggleUnread = useCallback(
    (workspaceId: string) => {
      const lastRead = lastReadMap[workspaceId] ?? 0;
      const state = workspaceStates.get(workspaceId);

      // Calculate if currently unread (same logic as unreadStatus)
      const isCurrentlyUnread =
        state?.messages.some(
          (msg) =>
            msg.type !== "user" && msg.type !== "history-hidden" && (msg.timestamp ?? 0) > lastRead
        ) ?? false;

      if (isCurrentlyUnread) {
        // Mark as read
        markAsRead(workspaceId);
      } else {
        // Mark as unread by setting timestamp to 0 (older than any message)
        setLastReadMap((prev) => ({
          ...prev,
          [workspaceId]: 0,
        }));
      }
    },
    [lastReadMap, workspaceStates, markAsRead, setLastReadMap]
  );

  return {
    unreadStatus,
    toggleUnread,
  };
}

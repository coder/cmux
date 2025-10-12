import { useEffect } from "react";
import type { WorkspaceState } from "./useWorkspaceAggregators";
import { usePersistedState } from "./usePersistedState";

/**
 * Tracks last assistant message timestamp per workspace for recency-based sorting.
 * Timestamps come from persisted message metadata, so they survive app restarts
 * and are correct during history replay.
 * Returns map of workspaceId → timestamp (0 if no assistant messages yet).
 * Automatically cleans up timestamps for deleted workspaces.
 */
export function useWorkspaceRecency(workspaceStates: Map<string, WorkspaceState>) {
  const [timestamps, setTimestamps] = usePersistedState<Record<string, number>>(
    "workspaceLastStreamStart",
    {},
    { listener: true }
  );

  useEffect(() => {
    setTimestamps((prev) => {
      const updated = { ...prev };
      let changed = false;

      // Update timestamps from workspace states
      for (const [id, state] of workspaceStates) {
        if (state.lastStreamStart && updated[id] !== state.lastStreamStart) {
          updated[id] = state.lastStreamStart;
          changed = true;
        }
      }

      // Clean up timestamps for deleted workspaces
      const currentIds = new Set(workspaceStates.keys());
      for (const id of Object.keys(updated)) {
        if (!currentIds.has(id)) {
          delete updated[id];
          changed = true;
        }
      }

      return changed ? updated : prev;
    });
  }, [workspaceStates, setTimestamps]);

  return timestamps;
}

import { useEffect, useRef } from "react";
import type { WorkspaceState } from "./useWorkspaceAggregators";
import { usePersistedState } from "./usePersistedState";

/**
 * Tracks last stream start timestamp per workspace for recency-based sorting.
 * Returns map of workspaceId → timestamp (0 if never streamed).
 * Automatically cleans up timestamps for deleted workspaces.
 */
export function useWorkspaceRecency(workspaceStates: Map<string, WorkspaceState>) {
  const [timestamps, setTimestamps] = usePersistedState<Record<string, number>>(
    "workspaceLastStreamStart",
    {},
    { listener: true }
  );
  const prevStreaming = useRef(new Map<string, boolean>());

  useEffect(() => {
    // Track stream starts
    for (const [id, state] of workspaceStates) {
      const was = prevStreaming.current.get(id) ?? false;
      const is = state.canInterrupt;
      if (!was && is) setTimestamps((prev) => ({ ...prev, [id]: Date.now() }));
      prevStreaming.current.set(id, is);
    }

    // Clean up timestamps for deleted workspaces
    setTimestamps((prev) => {
      const currentIds = new Set(workspaceStates.keys());
      const staleIds = Object.keys(prev).filter((id) => !currentIds.has(id));
      if (staleIds.length === 0) return prev; // No cleanup needed

      const cleaned = { ...prev };
      for (const id of staleIds) delete cleaned[id];
      return cleaned;
    });
  }, [workspaceStates, setTimestamps]);

  return timestamps;
}

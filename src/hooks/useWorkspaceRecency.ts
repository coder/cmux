import { useEffect, useRef } from "react";
import type { WorkspaceState } from "./useWorkspaceAggregators";
import { usePersistedState } from "./usePersistedState";

/**
 * Tracks last stream start timestamp per workspace for recency-based sorting.
 * Returns map of workspaceId → timestamp (0 if never streamed).
 */
export function useWorkspaceRecency(workspaceStates: Map<string, WorkspaceState>) {
  const [timestamps, setTimestamps] = usePersistedState<Record<string, number>>(
    "workspaceLastStreamStart",
    {},
    { listener: true }
  );
  const prevStreaming = useRef(new Map<string, boolean>());

  useEffect(() => {
    for (const [id, state] of workspaceStates) {
      const was = prevStreaming.current.get(id) ?? false;
      const is = state.canInterrupt;
      if (!was && is) setTimestamps((prev) => ({ ...prev, [id]: Date.now() }));
      prevStreaming.current.set(id, is);
    }
  }, [workspaceStates, setTimestamps]);

  return timestamps;
}

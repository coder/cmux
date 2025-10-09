import { usePersistedState } from "@/hooks/usePersistedState";

/**
 * Custom hook for 1M context state.
 * Persists state per workspace in localStorage.
 *
 * @param workspaceId - Unique identifier for the workspace
 * @returns [use1MContext, setUse1MContext] tuple
 */
export function use1MContext(workspaceId: string): [boolean, (value: boolean) => void] {
  return usePersistedState<boolean>(`use1MContext:${workspaceId}`, false);
}

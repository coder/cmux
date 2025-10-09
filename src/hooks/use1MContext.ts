import { usePersistedState } from "@/hooks/usePersistedState";

/**
 * Custom hook for 1M context state.
 * Persists state globally in localStorage (applies to all workspaces).
 *
 * @returns [use1MContext, setUse1MContext] tuple
 */
export function use1MContext(): [boolean, (value: boolean) => void] {
  return usePersistedState<boolean>("use1MContext", false);
}


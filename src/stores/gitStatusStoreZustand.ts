import { create } from 'zustand';
import type { GitStatus } from '@/types/workspace';
import { GitStatusStore } from './GitStatusStore';

interface GitStatusStoreState {
  store: GitStatusStore;
  version: number;
}

/**
 * Zustand wrapper around GitStatusStore.
 */
export const useGitStatusStoreZustand = create<GitStatusStoreState>((set) => {
  const store = new GitStatusStore();

  // Subscribe to store changes
  store.subscribe(() => {
    set((state) => ({ version: state.version + 1 }));
  });

  return {
    store,
    version: 0,
  };
});

/**
 * Hook to get git status for a specific workspace.
 * Only re-renders when THIS workspace's status changes.
 */
export function useGitStatus(workspaceId: string): GitStatus | null {
  return useGitStatusStoreZustand((state) => state.store.getStatus(workspaceId));
}

/**
 * Hook to access the raw store for imperative operations.
 */
export function useGitStatusStoreRaw(): GitStatusStore {
  return useGitStatusStoreZustand((state) => state.store);
}

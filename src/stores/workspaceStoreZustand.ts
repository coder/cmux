import { create } from 'zustand';
import type { WorkspaceState } from './WorkspaceStore';
import { WorkspaceStore } from './WorkspaceStore';

interface WorkspaceStoreState {
  // The underlying store instance
  store: WorkspaceStore;
  
  // Trigger for subscribers (increment to notify changes)
  version: number;
}

/**
 * Zustand wrapper around WorkspaceStore.
 * 
 * Benefits:
 * - Automatic subscription management
 * - Selector-based rendering (only re-render when selector result changes)
 * - Simpler hook API
 * 
 * The WorkspaceStore class handles the complex IPC and aggregator logic.
 * Zustand handles the React integration.
 */
export const useWorkspaceStoreZustand = create<WorkspaceStoreState>((set) => {
  const store = new WorkspaceStore(() => {
    // Model tracking callback - can hook into other systems if needed
  });

  // Subscribe to store changes and increment version to trigger React updates
  store.subscribe(() => {
    set((state) => ({ version: state.version + 1 }));
  });

  return {
    store,
    version: 0,
  };
});

/**
 * Hook to get state for a specific workspace.
 * Only re-renders when THIS workspace's state changes.
 */
export function useWorkspaceState(workspaceId: string): WorkspaceState {
  return useWorkspaceStoreZustand(
    (state) => state.store.getWorkspaceState(workspaceId),
    // Zustand's shallow comparison works because getWorkspaceState returns cached references
  );
}

/**
 * Hook to get all workspace IDs.
 * Re-renders when workspaces are added/removed (but not when their content changes).
 */
export function useWorkspaceIds(): string[] {
  return useWorkspaceStoreZustand(
    (state) => {
      const allStates = state.store.getAllStates();
      return Array.from(allStates.keys());
    },
  );
}

/**
 * Hook to access the raw store for imperative operations.
 */
export function useWorkspaceStoreRaw(): WorkspaceStore {
  return useWorkspaceStoreZustand((state) => state.store);
}

/**
 * Hook to get workspace recency timestamps.
 */
export function useWorkspaceRecency(): Record<string, number> {
  return useWorkspaceStoreZustand((state) => state.store.getWorkspaceRecency());
}

/**
 * Hook to get an aggregator for a workspace.
 */
export function useWorkspaceAggregator(workspaceId: string) {
  const store = useWorkspaceStoreRaw();
  return store.getAggregator(workspaceId);
}

import { useSyncExternalStore, useContext, createContext, type ReactNode } from "react";
import { WorkspaceStore, type WorkspaceState } from "@/stores/WorkspaceStore";
import type { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";

/**
 * Context to provide WorkspaceStore instance to components.
 */
const WorkspaceStoreContext = createContext<WorkspaceStore | null>(null);

export function WorkspaceStoreProvider({
  store,
  children,
}: {
  store: WorkspaceStore;
  children: ReactNode;
}) {
  return <WorkspaceStoreContext.Provider value={store}>{children}</WorkspaceStoreContext.Provider>;
}

function useWorkspaceStoreInstance(): WorkspaceStore {
  const store = useContext(WorkspaceStoreContext);
  if (!store) {
    throw new Error("useWorkspaceStore must be used within WorkspaceStoreProvider");
  }
  return store;
}

/**
 * Subscribe to a specific workspace's state.
 * Only re-renders when THIS workspace's state changes.
 *
 * @param workspaceId - ID of the workspace to subscribe to
 * @returns Workspace state or undefined if workspace doesn't exist
 */
export function useWorkspaceState(workspaceId: string): WorkspaceState | undefined {
  const store = useWorkspaceStoreInstance();

  return useSyncExternalStore(
    store.subscribe,
    () => {
      try {
        return store.getWorkspaceState(workspaceId);
      } catch {
        return undefined;
      }
    },
    () => undefined // Server snapshot (not applicable)
  );
}

/**
 * Subscribe to all workspace states.
 * Re-renders when ANY workspace changes.
 * Use sparingly - prefer useWorkspaceState for single workspaces.
 *
 * @returns Map of all workspace states
 */
export function useAllWorkspaceStates(): Map<string, WorkspaceState> {
  const store = useWorkspaceStoreInstance();

  return useSyncExternalStore(
    store.subscribe,
    () => store.getAllStates(),
    () => new Map() // Server snapshot
  );
}

/**
 * Subscribe to workspace recency timestamps (for sorting).
 * Only re-renders when recency values change.
 *
 * @returns Record of workspace IDs to recency timestamps
 */
export function useWorkspaceRecency(): Record<string, number> {
  const store = useWorkspaceStoreInstance();

  return useSyncExternalStore(
    store.subscribe,
    () => store.getWorkspaceRecency(),
    () => ({}) // Server snapshot
  );
}

/**
 * Get direct access to a workspace's aggregator.
 * Use only when you need low-level aggregator methods.
 *
 * @param workspaceId - ID of the workspace
 * @returns StreamingMessageAggregator instance
 */
export function useWorkspaceAggregator(workspaceId: string): StreamingMessageAggregator {
  const store = useWorkspaceStoreInstance();
  return store.getAggregator(workspaceId);
}

/**
 * Get the store instance directly (for imperative operations).
 * Use sparingly - prefer declarative hooks above.
 */
export function useWorkspaceStoreRaw(): WorkspaceStore {
  return useWorkspaceStoreInstance();
}


import type { WorkspaceMetadata, GitStatus } from "@/types/workspace";
import { parseGitShowBranchForStatus } from "@/utils/git/parseGitStatus";
import {
  GIT_STATUS_SCRIPT,
  GIT_FETCH_SCRIPT,
  parseGitStatusScriptOutput,
} from "@/utils/git/gitStatus";

/**
 * External store for git status of all workspaces.
 *
 * Architecture:
 * - Lives outside React lifecycle (stable references)
 * - Polls git status every 3 seconds
 * - Manages git fetch with exponential backoff
 * - Notifies subscribers when status changes
 * - Components only re-render when their specific workspace status changes
 *
 * Migration from GitStatusContext:
 * - Eliminates provider re-renders every 3 seconds
 * - useSyncExternalStore enables selective re-renders
 * - Store manages polling logic internally (no useEffect cleanup in components)
 */

// Configuration
const GIT_STATUS_INTERVAL_MS = 3000; // 3 seconds - interactive updates
const MAX_CONCURRENT_GIT_OPS = 5;

// Fetch configuration - aggressive intervals for fresh data
const FETCH_BASE_INTERVAL_MS = 3 * 1000; // 3 seconds
const FETCH_MAX_INTERVAL_MS = 60 * 1000; // 60 seconds

interface FetchState {
  lastFetch: number;
  inProgress: boolean;
  consecutiveFailures: number;
}

type Listener = () => void;

export class GitStatusStore {
  private gitStatusMap = new Map<string, GitStatus | null>();
  private fetchCache = new Map<string, FetchState>();
  private listeners = new Set<Listener>();
  private pollInterval: NodeJS.Timeout | null = null;
  private workspaceMetadata = new Map<string, WorkspaceMetadata>();
  private isActive = true;

  // Cache for stable references
  private statusCache = new Map<string, GitStatus | null>();
  private allStatusCache: Map<string, GitStatus | null> | null = null;

  constructor() {
    // Store is ready for workspace sync
  }

  /**
   * Subscribe to git status changes.
   * Called by React's useSyncExternalStore.
   * Arrow function ensures stable reference for useSyncExternalStore.
   */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Get git status for a specific workspace.
   * Returns cached reference if status unchanged.
   */
  getStatus(workspaceId: string): GitStatus | null {
    const current = this.gitStatusMap.get(workspaceId) ?? null;
    const cached = this.statusCache.get(workspaceId);

    // Compare using deep equality
    if (this.compareGitStatus(cached ?? null, current)) {
      return cached ?? null;
    }

    // Status changed - update cache
    this.statusCache.set(workspaceId, current);
    return current;
  }

  /**
   * Get all git statuses as a Map.
   * Returns cached reference if no statuses changed.
   */
  getAllStatuses(): Map<string, GitStatus | null> {
    // Check if any status changed
    let hasChanges = false;

    if (!this.allStatusCache || this.allStatusCache.size !== this.gitStatusMap.size) {
      hasChanges = true;
    } else {
      for (const [id, status] of this.gitStatusMap) {
        const cached = this.allStatusCache.get(id);
        if (!this.compareGitStatus(cached ?? null, status ?? null)) {
          hasChanges = true;
          break;
        }
      }
    }

    if (!hasChanges && this.allStatusCache) {
      return this.allStatusCache;
    }

    // Create new Map with current statuses
    this.allStatusCache = new Map(this.gitStatusMap);
    return this.allStatusCache;
  }

  /**
   * Sync workspaces with metadata.
   * Called when workspace list changes.
   */
  syncWorkspaces(metadata: Map<string, WorkspaceMetadata>): void {
    // Reactivate if disposed by React Strict Mode (dev only)
    // In dev, Strict Mode unmounts/remounts, disposing the store but reusing the ref
    if (!this.isActive && metadata.size > 0) {
      this.isActive = true;
    }

    this.workspaceMetadata = metadata;

    // Remove statuses for deleted workspaces (only emit if we actually remove something)
    let removedAny = false;
    for (const id of this.gitStatusMap.keys()) {
      if (!metadata.has(id)) {
        this.gitStatusMap.delete(id);
        this.statusCache.delete(id);
        removedAny = true;
      }
    }

    // Only emit if we removed workspaces (subscribers need to know)
    if (removedAny) {
      this.emit();
    }

    // Start polling only once (not on every sync)
    if (!this.pollInterval) {
      this.startPolling();
    }
  }

  /**
   * Start polling git status.
   */
  private startPolling(): void {
    // Clear existing interval
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // Run immediately
    void this.updateGitStatus();

    // Poll at configured interval
    this.pollInterval = setInterval(() => {
      void this.updateGitStatus();
    }, GIT_STATUS_INTERVAL_MS);
  }

  /**
   * Stop polling git status.
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Update git status for all workspaces.
   */
  private async updateGitStatus(): Promise<void> {
    if (this.workspaceMetadata.size === 0 || !this.isActive) {
      return;
    }

    // Group workspaces by project for fetch management
    const projectGroups = this.groupWorkspacesByProject(this.workspaceMetadata);

    // Try to fetch one project per cycle (background, non-blocking)
    this.tryFetchNextProject(projectGroups);

    // Query git status for each workspace
    // Rate limit: Process in batches to prevent bash process explosion
    const workspaces = Array.from(this.workspaceMetadata.values());
    const results: Array<[string, GitStatus | null]> = [];

    for (let i = 0; i < workspaces.length; i += MAX_CONCURRENT_GIT_OPS) {
      if (!this.isActive) break; // Stop if disposed

      const batch = workspaces.slice(i, i + MAX_CONCURRENT_GIT_OPS);
      const batchPromises = batch.map((metadata) => this.checkWorkspaceStatus(metadata));

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    if (!this.isActive) return; // Don't update state if disposed

    // Update map
    this.gitStatusMap = new Map(results);

    // Notify subscribers
    this.emit();
  }

  /**
   * Check git status for a single workspace.
   */
  private async checkWorkspaceStatus(
    metadata: WorkspaceMetadata
  ): Promise<[string, GitStatus | null]> {
    try {
      const result = await window.api.workspace.executeBash(metadata.id, GIT_STATUS_SCRIPT, {
        timeout_secs: 5,
        niceness: 19, // Lowest priority - don't interfere with user operations
      });

      if (!result.success) {
        console.debug(`[gitStatus] IPC failed for ${metadata.id}:`, result.error);
        return [metadata.id, null];
      }

      if (!result.data.success) {
        console.debug(`[gitStatus] Script failed for ${metadata.id}:`, result.data.error);
        return [metadata.id, null];
      }

      // Parse the output using centralized function
      const parsed = parseGitStatusScriptOutput(result.data.output);

      if (!parsed) {
        console.debug(`[gitStatus] Could not parse output for ${metadata.id}`);
        return [metadata.id, null];
      }

      const { showBranchOutput, dirtyCount } = parsed;
      const dirty = dirtyCount > 0;

      // Parse ahead/behind from show-branch output
      const parsedStatus = parseGitShowBranchForStatus(showBranchOutput);

      if (!parsedStatus) {
        return [metadata.id, null];
      }

      return [metadata.id, { ...parsedStatus, dirty }];
    } catch (err) {
      // Silently fail - git status failures shouldn't crash the UI
      console.debug(`[gitStatus] Exception for ${metadata.id}:`, err);
      return [metadata.id, null];
    }
  }

  /**
   * Group workspaces by project name.
   */
  private groupWorkspacesByProject(
    metadata: Map<string, WorkspaceMetadata>
  ): Map<string, WorkspaceMetadata[]> {
    const groups = new Map<string, WorkspaceMetadata[]>();

    for (const m of metadata.values()) {
      // Extract project name from workspace path
      // Format: ~/.cmux/src/{projectName}/{branchName}
      const parts = m.workspacePath.split("/");
      const projectName = parts[parts.length - 2];

      if (!groups.has(projectName)) {
        groups.set(projectName, []);
      }
      groups.get(projectName)!.push(m);
    }

    return groups;
  }

  /**
   * Try to fetch the project that needs it most urgently.
   */
  private tryFetchNextProject(projectGroups: Map<string, WorkspaceMetadata[]>): void {
    let targetProject: string | null = null;
    let targetWorkspaceId: string | null = null;
    let oldestTime = Date.now();

    for (const [projectName, workspaces] of projectGroups) {
      if (workspaces.length === 0) continue;

      if (this.shouldFetch(projectName)) {
        const cache = this.fetchCache.get(projectName);
        const lastFetch = cache?.lastFetch ?? 0;

        if (lastFetch < oldestTime) {
          oldestTime = lastFetch;
          targetProject = projectName;
          targetWorkspaceId = workspaces[0].id;
        }
      }
    }

    if (targetProject && targetWorkspaceId) {
      // Fetch in background (don't await - don't block status checks)
      void this.fetchProject(targetProject, targetWorkspaceId);
    }
  }

  /**
   * Check if project should be fetched.
   */
  private shouldFetch(projectName: string): boolean {
    const cached = this.fetchCache.get(projectName);
    if (!cached) return true;
    if (cached.inProgress) return false;

    // Calculate delay with exponential backoff: 3s, 6s, 12s, 24s, 48s, 60s (max)
    const delay = Math.min(
      FETCH_BASE_INTERVAL_MS * Math.pow(2, cached.consecutiveFailures),
      FETCH_MAX_INTERVAL_MS
    );
    return Date.now() - cached.lastFetch > delay;
  }

  /**
   * Fetch updates for a project (one workspace is sufficient).
   */
  private async fetchProject(projectName: string, workspaceId: string): Promise<void> {
    const cache = this.fetchCache.get(projectName) ?? {
      lastFetch: 0,
      inProgress: false,
      consecutiveFailures: 0,
    };

    if (cache.inProgress) return;

    // Mark as in progress
    this.fetchCache.set(projectName, { ...cache, inProgress: true });

    try {
      const result = await window.api.workspace.executeBash(workspaceId, GIT_FETCH_SCRIPT, {
        timeout_secs: 30,
        niceness: 19, // Lowest priority - don't interfere with user operations
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      if (!result.data.success) {
        throw new Error(result.data.error || "Unknown error");
      }

      // Success - reset failure counter
      console.debug(`[fetch] Success for ${projectName}`);
      this.fetchCache.set(projectName, {
        lastFetch: Date.now(),
        inProgress: false,
        consecutiveFailures: 0,
      });
    } catch (error) {
      // All errors logged to console, never shown to user
      console.debug(`[fetch] Failed for ${projectName}:`, error);

      const newFailures = cache.consecutiveFailures + 1;
      const nextDelay = Math.min(
        FETCH_BASE_INTERVAL_MS * Math.pow(2, newFailures),
        FETCH_MAX_INTERVAL_MS
      );

      console.debug(
        `[fetch] Will retry ${projectName} after ${Math.round(nextDelay / 1000)}s ` +
          `(failure #${newFailures})`
      );

      this.fetchCache.set(projectName, {
        lastFetch: Date.now(),
        inProgress: false,
        consecutiveFailures: newFailures,
      });
    }
  }

  /**
   * Compare two GitStatus objects for equality.
   */
  private compareGitStatus(a: GitStatus | null, b: GitStatus | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;

    return a.ahead === b.ahead && a.behind === b.behind && a.dirty === b.dirty;
  }

  /**
   * Notify all subscribers.
   * Must be synchronous for useSyncExternalStore to work correctly.
   */
  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Cleanup resources.
   */
  dispose(): void {
    this.isActive = false;
    this.stopPolling();
    this.listeners.clear();
    this.gitStatusMap.clear();
    this.fetchCache.clear();
    this.statusCache.clear();
    this.allStatusCache = null;
  }
}

// ============================================================================
// Zustand Integration
// ============================================================================

import { create } from "zustand";

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

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { WorkspaceMetadata, GitStatus } from "@/types/workspace";
import { parseGitShowBranchForStatus } from "@/utils/git/parseGitStatus";
import {
  GIT_STATUS_SCRIPT,
  GIT_FETCH_SCRIPT,
  parseGitStatusScriptOutput,
} from "@/utils/git/gitStatus";

const GitStatusContext = createContext<Map<string, GitStatus | null>>(new Map());

interface GitStatusProviderProps {
  workspaceMetadata: Map<string, WorkspaceMetadata>;
  children: React.ReactNode;
}

/**
 * Provides git status for all workspaces via context.
 *
 * This isolates git status updates (every 10 seconds) from the main app tree.
 * Only components that call useGitStatus() will re-render when git status updates.
 *
 * Architecture:
 * - GitStatusProvider polls git status every 10 seconds
 * - Updates internal state (causes provider to re-render)
 * - Only consumers of useGitStatus() re-render (not entire app)
 *
 * Performance:
 * - 10 second interval prevents CPU overload
 * - Skips git fetch (too expensive, not critical for display)
 * - Max 5 concurrent git status checks to prevent bash process explosion
 */
// Configuration - enabled by default, no env variables needed
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

export function GitStatusProvider({ workspaceMetadata, children }: GitStatusProviderProps) {
  const [gitStatus, setGitStatus] = useState<Map<string, GitStatus | null>>(new Map());
  const fetchCache = useRef<Map<string, FetchState>>(new Map());

  // Helper: Check if project should be fetched
  const shouldFetch = useCallback((projectName: string): boolean => {
    const cached = fetchCache.current.get(projectName);
    if (!cached) return true;
    if (cached.inProgress) return false;

    // Calculate delay with exponential backoff: 3s, 6s, 12s, 24s, 48s, 60s (max)
    const delay = Math.min(
      FETCH_BASE_INTERVAL_MS * Math.pow(2, cached.consecutiveFailures),
      FETCH_MAX_INTERVAL_MS
    );
    return Date.now() - cached.lastFetch > delay;
  }, []);

  // Helper: Fetch updates for a project (one workspace is sufficient)
  const fetchProject = useCallback(
    async (projectName: string, workspaceId: string): Promise<void> => {
      const cache = fetchCache.current.get(projectName) ?? {
        lastFetch: 0,
        inProgress: false,
        consecutiveFailures: 0,
      };

      if (cache.inProgress) return;

      // Mark as in progress
      fetchCache.current.set(projectName, { ...cache, inProgress: true });

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
        fetchCache.current.set(projectName, {
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

        fetchCache.current.set(projectName, {
          lastFetch: Date.now(),
          inProgress: false,
          consecutiveFailures: newFailures,
        });
      }
    },
    []
  );

  // Helper: Group workspaces by project name
  const groupWorkspacesByProject = (
    metadata: Map<string, WorkspaceMetadata>
  ): Map<string, WorkspaceMetadata[]> => {
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
  };

  // Helper: Try to fetch the project that needs it most urgently
  const tryFetchNextProject = useCallback(
    (projectGroups: Map<string, WorkspaceMetadata[]>): void => {
      let targetProject: string | null = null;
      let targetWorkspaceId: string | null = null;
      let oldestTime = Date.now();

      for (const [projectName, workspaces] of projectGroups) {
        if (workspaces.length === 0) continue;

        if (shouldFetch(projectName)) {
          const cache = fetchCache.current.get(projectName);
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
        void fetchProject(targetProject, targetWorkspaceId);
      }
    },
    [shouldFetch, fetchProject]
  );

  // Git status polling - restarts when workspace metadata changes (rare)
  useEffect(() => {
    let isActive = true; // Prevent updates after unmount

    const updateGitStatus = async () => {
      if (workspaceMetadata.size === 0 || !isActive) {
        return;
      }

      // Group workspaces by project for fetch management
      const projectGroups = groupWorkspacesByProject(workspaceMetadata);

      // Try to fetch one project per cycle (background, non-blocking)
      tryFetchNextProject(projectGroups);

      // Query git status for each workspace
      // Rate limit: Process in batches to prevent bash process explosion
      const workspaces = Array.from(workspaceMetadata.values());
      const results: Array<[string, GitStatus | null]> = [];

      for (let i = 0; i < workspaces.length; i += MAX_CONCURRENT_GIT_OPS) {
        if (!isActive) break; // Stop if unmounted

        const batch = workspaces.slice(i, i + MAX_CONCURRENT_GIT_OPS);
        const batchPromises = batch.map((metadata) =>
          (async (): Promise<[string, GitStatus | null]> => {
            try {
              const result = await window.api.workspace.executeBash(
                metadata.id,
                GIT_STATUS_SCRIPT,
                {
                  timeout_secs: 5,
                  niceness: 19, // Lowest priority - don't interfere with user operations
                }
              );

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
          })()
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      if (!isActive) return; // Don't update state if unmounted

      setGitStatus(new Map(results));
    };

    // Run immediately on mount or when workspaces change
    void updateGitStatus();

    // Poll git status at configured interval
    const interval = setInterval(() => {
      void updateGitStatus();
    }, GIT_STATUS_INTERVAL_MS);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [workspaceMetadata, tryFetchNextProject]); // Restarts when workspaces are added/removed/renamed (rare)

  return <GitStatusContext.Provider value={gitStatus}>{children}</GitStatusContext.Provider>;
}

/**
 * Hook to access git status for all workspaces.
 *
 * Components using this hook will re-render when git status updates (every 1 second).
 * Use selectively - only in components that display git status.
 */
export function useGitStatus(): Map<string, GitStatus | null> {
  return useContext(GitStatusContext);
}

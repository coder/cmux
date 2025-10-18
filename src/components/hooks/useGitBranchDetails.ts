import { useReducer, useEffect, useCallback } from "react";
import type { GitStatus } from "@/types/workspace";
import type { GitCommit, GitBranchHeader } from "@/utils/git/parseGitLog";
import { fetchGitBranchInfo } from "@/utils/git/fetchBranchInfo";
import { useTimedCache } from "./useTimedCache";
import { useDebouncedCallback } from "./useDebouncedCallback";
import { assert } from "@/utils/assert";

export interface GitBranchDetailsResult {
  branchHeaders: GitBranchHeader[] | null;
  commits: GitCommit[] | null;
  dirtyFiles: string[] | null;
  isLoading: boolean;
  errorMessage: string | null;
  invalidateCache: () => void;
  refresh: () => void;
}

interface GitBranchData {
  headers: GitBranchHeader[];
  commits: GitCommit[];
  dirtyFiles: string[];
}

type GitBranchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: GitBranchData };

type GitBranchAction =
  | { type: "START_LOADING" }
  | { type: "FETCH_SUCCESS"; data: GitBranchData }
  | { type: "FETCH_ERROR"; error: string }
  | { type: "RESET" };

function gitBranchReducer(state: GitBranchState, action: GitBranchAction): GitBranchState {
  switch (action.type) {
    case "START_LOADING":
      return { status: "loading" };
    case "FETCH_SUCCESS":
      return { status: "success", data: action.data };
    case "FETCH_ERROR":
      return { status: "error", error: action.error };
    case "RESET":
      return { status: "idle" };
    default:
      return state;
  }
}

/**
 * Hook for fetching git branch details (show-branch output, dirty files).
 * Implements caching (5s TTL) and debouncing (200ms) to avoid excessive IPC calls.
 *
 * @param workspaceId - Workspace to fetch git details for
 * @param gitStatus - Current git status (used to determine if dirty files should be fetched)
 * @param enabled - Whether to fetch data (typically when tooltip should be shown)
 */
export function useGitBranchDetails(
  workspaceId: string,
  gitStatus: GitStatus | null,
  enabled: boolean
): GitBranchDetailsResult {
  assert(
    workspaceId.trim().length > 0,
    "useGitBranchDetails expects a non-empty workspaceId argument."
  );

  const [state, dispatch] = useReducer(gitBranchReducer, { status: "idle" });
  const cache = useTimedCache<GitBranchData>(5000); // 5 second TTL

  const fetchBranchDetails = useCallback(async () => {
    // Check cache first
    const cached = cache.get();
    if (cached) {
      dispatch({ type: "FETCH_SUCCESS", data: cached });
      return;
    }

    dispatch({ type: "START_LOADING" });

    try {
      const result = await fetchGitBranchInfo(workspaceId, gitStatus?.dirty ?? false);

      if (result.success) {
        const data: GitBranchData = {
          headers: result.headers,
          commits: result.commits,
          dirtyFiles: result.dirtyFiles,
        };
        cache.set(data);
        dispatch({ type: "FETCH_SUCCESS", data });
      } else {
        dispatch({ type: "FETCH_ERROR", error: `Branch info unavailable: ${result.error}` });
      }
    } catch (error) {
      dispatch({
        type: "FETCH_ERROR",
        error: `Failed to fetch branch info: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, [workspaceId, gitStatus?.dirty, cache]);

  const debouncedFetch = useDebouncedCallback(fetchBranchDetails, 200);

  const refresh = useCallback(() => {
    cache.invalidate();
    if (enabled) {
      dispatch({ type: "START_LOADING" });
      void fetchBranchDetails(); // Immediate, not debounced
    }
  }, [enabled, fetchBranchDetails, cache]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Trigger debounced fetch
    debouncedFetch();
  }, [enabled, workspaceId, gitStatus?.dirty, debouncedFetch]);

  // Map state to return interface
  return {
    branchHeaders: state.status === "success" ? state.data.headers : null,
    commits: state.status === "success" ? state.data.commits : null,
    dirtyFiles: state.status === "success" ? state.data.dirtyFiles : null,
    isLoading: state.status === "loading",
    errorMessage: state.status === "error" ? state.error : null,
    invalidateCache: cache.invalidate,
    refresh,
  };
}

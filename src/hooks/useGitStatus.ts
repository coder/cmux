import { useState, useEffect } from "react";
import type { WorkspaceMetadata, DisplayedWorkspaceMetadata } from "@/types/workspace";
import { parseGitShowBranchForStatus } from "@/utils/git/parseGitStatus";

/**
 * Hook to poll git status for all workspaces and enrich metadata with git status.
 *
 * Design guarantee: Iterates over ALL workspaces in workspaceMetadata to ensure
 * git status is checked for every workspace.
 *
 * Optimization: Groups workspaces by project and runs `git fetch` once per project
 * (all worktrees share the same origin).
 *
 * Polls every 1 second.
 */
export function useGitStatus(
  workspaceMetadata: Map<string, WorkspaceMetadata>
): Map<string, DisplayedWorkspaceMetadata> {
  const [enrichedMetadata, setEnrichedMetadata] = useState<Map<string, DisplayedWorkspaceMetadata>>(
    new Map()
  );

  useEffect(() => {
    // Initialize enriched metadata with null git status
    const initializeMetadata = () => {
      const initial = new Map<string, DisplayedWorkspaceMetadata>();
      for (const [workspacePath, metadata] of workspaceMetadata.entries()) {
        initial.set(workspacePath, {
          ...metadata,
          gitStatus: null,
        });
      }
      setEnrichedMetadata(initial);
    };

    initializeMetadata();

    // Run immediately on mount
    void updateGitStatus();

    // Poll git status every 1 second
    const interval = setInterval(() => {
      void updateGitStatus();
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMetadata]);

  const updateGitStatus = async () => {
    // Group workspaces by projectName (all worktrees of same project share origin)
    const projectToWorkspaces = new Map<string, WorkspaceMetadata[]>();
    for (const [, metadata] of workspaceMetadata.entries()) {
      const existing = projectToWorkspaces.get(metadata.projectName) ?? [];
      existing.push(metadata);
      projectToWorkspaces.set(metadata.projectName, existing);
    }

    // Run git fetch once per project (use first workspace of each project)
    const fetchPromises: Array<Promise<void>> = [];
    for (const [, workspaces] of projectToWorkspaces.entries()) {
      if (workspaces.length === 0) continue;

      const representativeWorkspace = workspaces[0];
      fetchPromises.push(
        (async () => {
          try {
            await window.api.workspace.executeBash(representativeWorkspace.id, "git fetch", {
              timeout_secs: 5,
            });
          } catch {
            // Silently fail - git fetch failures shouldn't block status updates
            console.debug(`Failed to fetch for project ${representativeWorkspace.projectName}`);
          }
        })()
      );
    }

    // Wait for all fetches to complete
    await Promise.all(fetchPromises);

    // Query git status for each workspace
    const statusPromises: Array<Promise<[string, DisplayedWorkspaceMetadata]>> = [];
    for (const [workspacePath, metadata] of workspaceMetadata.entries()) {
      statusPromises.push(
        (async (): Promise<[string, DisplayedWorkspaceMetadata]> => {
          try {
            // Get primary branch from origin - try multiple methods
            // Method 1: symbolic-ref (fastest if available)
            let primaryBranch = "";
            const symbolicResult = await window.api.workspace.executeBash(
              metadata.id,
              "git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'",
              { timeout_secs: 5 }
            );

            if (symbolicResult.success && symbolicResult.data.success) {
              primaryBranch = symbolicResult.data.output.trim();
            }

            // Method 2: If that failed, try git remote show origin
            if (!primaryBranch) {
              const remoteShowResult = await window.api.workspace.executeBash(
                metadata.id,
                "git remote show origin | grep 'HEAD branch' | cut -d' ' -f5",
                { timeout_secs: 5 }
              );

              if (remoteShowResult.success && remoteShowResult.data.success) {
                primaryBranch = remoteShowResult.data.output.trim();
              }
            }

            // Method 3: Fall back to checking for main or master
            if (!primaryBranch) {
              const branchCheckResult = await window.api.workspace.executeBash(
                metadata.id,
                "git branch -r | grep -E 'origin/(main|master)$' | head -1 | sed 's@^.*origin/@@'",
                { timeout_secs: 5 }
              );

              if (branchCheckResult.success && branchCheckResult.data.success) {
                primaryBranch = branchCheckResult.data.output.trim();
              }
            }

            if (!primaryBranch) {
              console.debug(`[useGitStatus] Could not determine primary branch for ${metadata.id}`);
              return [workspacePath, { ...metadata, gitStatus: null }];
            }

            // Get ahead/behind counts using git show-branch for meaningful divergence
            const showBranchResult = await window.api.workspace.executeBash(
              metadata.id,
              `git show-branch --sha1-name HEAD origin/${primaryBranch}`,
              { timeout_secs: 5 }
            );

            if (!showBranchResult.success || !showBranchResult.data.success) {
              return [workspacePath, { ...metadata, gitStatus: null }];
            }

            const gitStatus = parseGitShowBranchForStatus(showBranchResult.data.output);

            if (!gitStatus) {
              return [workspacePath, { ...metadata, gitStatus: null }];
            }

            // Check for uncommitted changes (dirty status)
            const statusResult = await window.api.workspace.executeBash(
              metadata.id,
              "git status --porcelain",
              { timeout_secs: 2 }
            );

            let dirty = false;
            if (statusResult.success && statusResult.data.success) {
              // If git status --porcelain has any output, there are uncommitted changes
              dirty = statusResult.data.output.trim().length > 0;
            }

            return [workspacePath, { ...metadata, gitStatus: { ...gitStatus, dirty } }];
          } catch {
            // Silently fail - git status failures shouldn't crash the UI
            return [workspacePath, { ...metadata, gitStatus: null }];
          }
        })()
      );
    }

    // Wait for all status queries and update state
    const results = await Promise.all(statusPromises);
    const newEnrichedMetadata = new Map(results);
    setEnrichedMetadata(newEnrichedMetadata);
  };

  return enrichedMetadata;
}

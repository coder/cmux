import type { FrontendWorkspaceMetadata } from "@/types/workspace";

/**
 * Time threshold for considering a workspace "old" (24 hours in milliseconds)
 */
const OLD_WORKSPACE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Partition workspaces into recent and old based on recency timestamp.
 * Workspaces with no activity in the last 24 hours are considered "old".
 */
export function partitionWorkspacesByAge(
  workspaces: FrontendWorkspaceMetadata[],
  workspaceRecency: Record<string, number>
): {
  recent: FrontendWorkspaceMetadata[];
  old: FrontendWorkspaceMetadata[];
} {
  const now = Date.now();
  const recent: FrontendWorkspaceMetadata[] = [];
  const old: FrontendWorkspaceMetadata[] = [];

  for (const workspace of workspaces) {
    const recencyTimestamp = workspaceRecency[workspace.id] ?? 0;
    const age = now - recencyTimestamp;

    if (age > OLD_WORKSPACE_THRESHOLD_MS) {
      old.push(workspace);
    } else {
      recent.push(workspace);
    }
  }

  return { recent, old };
}


import { z } from "zod";

/**
 * Information about a GitHub Pull Request
 */
export interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
}

/**
 * Zod schema for workspace metadata validation
 */
export const WorkspaceMetadataSchema = z.object({
  id: z.string().min(1, "Workspace ID is required"),
  projectName: z.string().min(1, "Project name is required"),
  workspacePath: z.string().min(1, "Workspace path is required"),
});

/**
 * Unified workspace metadata type used throughout the application.
 * This is the single source of truth for workspace information.
 *
 * NOTE: This does NOT include branch name. Branch can be changed after workspace
 * creation (user can switch branches in the worktree), and we should not depend
 * on branch state in backend logic. Frontend can track branch for UI purposes.
 */
export interface WorkspaceMetadata {
  /** Unique workspace identifier (e.g., "project-branch") */
  id: string;

  /** Project name extracted from project path */
  projectName: string;

  /** Absolute path to the workspace worktree directory */
  workspacePath: string;
}

/**
 * UI-facing workspace metadata.
 */
export type WorkspaceMetadataUI = WorkspaceMetadata;

/**
 * Git status for a workspace (ahead/behind relative to origin's primary branch)
 */
export interface GitStatus {
  ahead: number;
  behind: number;
  /** Whether there are uncommitted changes (staged or unstaged) */
  dirty: boolean;
}

/**
 * Frontend-enriched workspace metadata with additional UI-specific data.
 * Extends backend WorkspaceMetadata with frontend-computed information.
 */
export interface DisplayedWorkspaceMetadata extends WorkspaceMetadata {
  /** Git status relative to origin's primary branch (null if not available) */
  gitStatus: GitStatus | null;
  /** Pull request information (null if no PR exists) */
  pullRequest: PullRequestInfo | null;
}

/**
 * Event emitted when workspace metadata changes
 */
export interface WorkspaceMetadataUpdate {
  workspaceId: string;
  metadata: WorkspaceMetadata;
}

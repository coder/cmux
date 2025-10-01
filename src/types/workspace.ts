import { z } from "zod";

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
 * Event emitted when workspace metadata changes
 */
export interface WorkspaceMetadataUpdate {
  workspaceId: string;
  metadata: WorkspaceMetadata;
}

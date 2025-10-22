import { z } from "zod";

/**
 * Zod schema for workspace metadata validation
 */
export const WorkspaceMetadataSchema = z.object({
  id: z.string().min(1, "Workspace ID is required"),
  title: z.string().optional(), // Auto-generated from conversation, optional for backward compatibility
  projectName: z.string().min(1, "Project name is required"),
  projectPath: z.string().min(1, "Project path is required"),
  createdAt: z.string().optional(), // ISO 8601 timestamp (optional for backward compatibility)
  // Legacy fields - ignored on load, removed on save
  name: z.string().optional(), // Legacy field, replaced by title
  workspacePath: z.string().optional(),
});

/**
 * Unified workspace metadata type used throughout the application.
 * This is the single source of truth for workspace information.
 *
 * ID vs Title:
 * - `id`: Stable unique identifier (10 hex chars for new workspaces, legacy format for old)
 *   Generated once at creation, never changes. Used for filesystem directory names.
 * - `title`: Auto-generated user-facing label (e.g., "Fix parser bug")
 *   Generated from conversation content after first message. Purely cosmetic.
 *   Editing title never affects filesystem - it's just for display.
 *
 * For legacy workspaces created before stable IDs:
 * - id is the old format (e.g., "cmux-stable-ids")
 * - title generates lazily on first use
 * For new workspaces (with autotitle):
 * - id is a random 10 hex char string (e.g., "a1b2c3d4e5")
 * - title is undefined initially, generated after first message
 * - Directory uses id: ~/.cmux/src/project/{id}
 *
 * Path handling:
 * - New workspaces: Directory is id-based (e.g., ~/.cmux/src/project/a1b2c3d4e5)
 * - Legacy workspaces: Directory may use old name format
 * - Worktree paths computed via config.getWorkspacePath(projectPath, id)
 * - This avoids storing redundant derived data
 */
export interface WorkspaceMetadata {
  /** Stable unique identifier (10 hex chars for new workspaces, legacy format for old) */
  id: string;

  /** Auto-generated title for display (optional, falls back to id if undefined) */
  title?: string;

  /** Project name extracted from project path (for display) */
  projectName: string;

  /** Absolute path to the project (needed to compute worktree path) */
  projectPath: string;

  /** ISO 8601 timestamp of when workspace was created (optional for backward compatibility) */
  createdAt?: string;
}

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
 * Frontend workspace metadata enriched with computed paths.
 * Backend computes these paths to avoid duplication of path construction logic.
 * Follows naming convention: Backend types vs Frontend types.
 */
export interface FrontendWorkspaceMetadata extends WorkspaceMetadata {
  /** Worktree path (uses workspace name as directory) */
  namedWorkspacePath: string;
}

/**
 * @deprecated Use FrontendWorkspaceMetadata instead
 */
export type WorkspaceMetadataWithPaths = FrontendWorkspaceMetadata;

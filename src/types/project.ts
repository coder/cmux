/**
 * Project and workspace configuration types.
 * Kept lightweight for preload script usage.
 */

/**
 * Workspace configuration in config.json.
 *
 * NEW FORMAT (preferred, used for all new workspaces):
 * {
 *   "path": "~/.cmux/src/project/workspace-id",  // Kept for backward compat
 *   "id": "a1b2c3d4e5",                          // Stable workspace ID
 *   "name": "feature-branch",                    // User-facing name
 *   "createdAt": "2024-01-01T00:00:00Z"         // Creation timestamp
 * }
 *
 * LEGACY FORMAT (old workspaces, still supported):
 * {
 *   "path": "~/.cmux/src/project/workspace-id"   // Only field present
 * }
 *
 * For legacy entries, metadata is read from ~/.cmux/sessions/{workspaceId}/metadata.json
 */
export interface Workspace {
  /** Absolute path to workspace worktree - REQUIRED for backward compatibility */
  path: string;

  /** Stable workspace ID (10 hex chars for new workspaces) - optional for legacy */
  id?: string;

  /** User-facing workspace name - optional for legacy */
  name?: string;

  /** ISO 8601 creation timestamp - optional for legacy */
  createdAt?: string;
}

export interface ProjectConfig {
  workspaces: Workspace[];
}

export interface ProjectsConfig {
  projects: Map<string, ProjectConfig>;
}

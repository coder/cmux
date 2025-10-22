/**
 * Project and workspace configuration types.
 * Kept lightweight for preload script usage.
 */

/**
 * Workspace configuration in config.json.
 *
 * NEW FORMAT (with autotitle, used for all new workspaces):
 * {
 *   "path": "~/.cmux/src/project/workspace-id",  // Kept for backward compat
 *   "id": "a1b2c3d4e5",                          // Stable workspace ID (used for directory)
 *   "title": "Fix parser bug",                   // Auto-generated display title
 *   "createdAt": "2024-01-01T00:00:00Z"         // Creation timestamp
 * }
 *
 * LEGACY FORMAT (old workspaces, still supported):
 * {
 *   "path": "~/.cmux/src/project/workspace-id",  // Only field present
 *   "id": "cmux-old-workspace",                  // May be old format
 *   "name": "old-workspace"                      // Legacy field, ignored
 * }
 *
 * For legacy entries, metadata is read from ~/.cmux/sessions/{workspaceId}/metadata.json
 */
export interface Workspace {
  /** Absolute path to workspace worktree - REQUIRED for backward compatibility */
  path: string;

  /** Stable workspace ID (10 hex chars for new workspaces) - optional for legacy */
  id?: string;

  /** Auto-generated workspace title for display - optional (falls back to id) */
  title?: string;

  /** ISO 8601 creation timestamp - optional for legacy */
  createdAt?: string;

  /** @deprecated Legacy field - replaced by title, ignored on load */
  name?: string;
}

export interface ProjectConfig {
  workspaces: Workspace[];
}

export interface ProjectsConfig {
  projects: Map<string, ProjectConfig>;
}

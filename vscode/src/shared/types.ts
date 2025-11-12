/**
 * GENERATED FILE - DO NOT EDIT
 * Auto-copied from src/types/ during extension build
 * Source: vscode/scripts/sync-shared.sh
 */

export type RuntimeConfig =
  | {
      type: "local";
      /** Base directory where all workspaces are stored (e.g., ~/.cmux/src) */
      srcBaseDir: string;
    }
  | {
      type: "ssh";
      /** SSH host (can be hostname, user@host, or SSH config alias) */
      host: string;
      /** Base directory on remote host where all workspaces are stored */
      srcBaseDir: string;
      /** Optional: Path to SSH private key (if not using ~/.ssh/config or ssh-agent) */
      identityFile?: string;
      /** Optional: SSH port (default: 22) */
      port?: number;
    };

export interface WorkspaceMetadata {
  /** Stable unique identifier (10 hex chars for new workspaces, legacy format for old) */
  id: string;

  /** User-facing workspace name (e.g., "feature-branch") */
  name: string;

  /** Project name extracted from project path (for display) */
  projectName: string;

  /** Absolute path to the project (needed to compute workspace path) */
  projectPath: string;

  /** ISO 8601 timestamp of when workspace was created (optional for backward compatibility) */
  createdAt?: string;

  /** Runtime configuration for this workspace (optional, defaults to local) */
  runtimeConfig?: RuntimeConfig;
}

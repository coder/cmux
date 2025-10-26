/**
 * Runtime configuration types for workspace execution environments
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

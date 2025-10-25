/**
 * Runtime configuration types for workspace execution environments
 */

export type RuntimeConfig =
  | {
      type: "local";
      /** Working directory on local host */
      workdir: string;
    }
  | {
      type: "ssh";
      /** SSH host (can be hostname, user@host, or SSH config alias) */
      host: string;
      /** Working directory on remote host */
      workdir: string;
      /** Optional: Path to SSH private key (if not using ~/.ssh/config or ssh-agent) */
      identityFile?: string;
      /** Optional: SSH port (default: 22) */
      port?: number;
    };

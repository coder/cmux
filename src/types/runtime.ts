/**
 * Runtime configuration types for workspace execution environments
 */

export type RuntimeConfig =
  | { type: "local" }
  | {
      type: "ssh";
      /** SSH host (can be hostname, user@host, or SSH config alias) */
      host: string;
      /** Working directory on remote host */
      workdir: string;
    };

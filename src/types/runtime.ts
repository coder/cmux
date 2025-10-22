/**
 * Runtime configuration types for workspace execution environments
 */

export type RuntimeConfig =
  | { type: "local" }
  | {
      type: "ssh";
      host: string;
      user: string;
      port?: number;
      keyPath?: string;
      password?: string;
      workdir: string;
    };


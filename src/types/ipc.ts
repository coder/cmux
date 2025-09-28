import { Result } from "./result";
import { WorkspaceMetadata } from "./workspace";
import type { CmuxMessage } from "./message";
import type { ProjectConfig } from "../config";

// Import constants from constants module (single source of truth)
import { IPC_CHANNELS, getOutputChannel, getClearChannel } from "../constants/ipc-constants";

// Re-export for TypeScript consumers
export { IPC_CHANNELS, getOutputChannel, getClearChannel };

// Type for all channel names
export type IPCChannel = string;

// Caught up message type
export interface CaughtUpMessage {
  type: "caught-up";
}

// Union type for workspace output messages
export type WorkspaceOutputMessage = CmuxMessage | CaughtUpMessage;

// Type guard for caught up messages
export function isCaughtUpMessage(msg: WorkspaceOutputMessage): msg is CaughtUpMessage {
  return "type" in msg && msg.type === "caught-up";
}

// API method signatures (shared between main and preload)
export interface IPCApi {
  config: {
    load(): Promise<{ projects: Array<[string, ProjectConfig]> }>;
    save(config: { projects: Array<[string, ProjectConfig]> }): Promise<boolean>;
  };
  dialog: {
    selectDirectory(): Promise<string | null>;
  };
  workspace: {
    list(): Promise<WorkspaceMetadata[]>;
    create(
      projectPath: string,
      branchName: string
    ): Promise<{ success: boolean; workspaceId?: string; path?: string; error?: string }>;
    remove(workspaceId: string): Promise<{ success: boolean; error?: string }>;
    sendMessage(workspaceId: string, message: string): Promise<Result<void, string>>;
    clearHistory(workspaceId: string): Promise<Result<void, string>>;
    getInfo(workspaceId: string): Promise<WorkspaceMetadata | null>;

    // Event subscriptions (renderer-only)
    onChatHistory(
      workspaceId: string,
      callback: (data: WorkspaceOutputMessage) => void
    ): () => void;
    onClear(workspaceId: string, callback: (data: unknown) => void): () => void;
    onMetadata(
      callback: (data: { workspaceId: string; metadata: WorkspaceMetadata }) => void
    ): () => void;
  };
}

import { Result } from "./result";
import { WorkspaceMetadata } from "./workspace";
import type { CmuxMessage } from "./message";
import type { ProjectConfig } from "../config";
import type { SendMessageError } from "./errors";

// Import constants from constants module (single source of truth)
import { IPC_CHANNELS, getChatChannel, getClearChannel } from "../constants/ipc-constants";

// Re-export for TypeScript consumers
export { IPC_CHANNELS, getChatChannel, getClearChannel };

// Type for all channel names
export type IPCChannel = string;

// Caught up message type
export interface CaughtUpMessage {
  type: "caught-up";
}

// Stream error message type (for async streaming errors)
export interface StreamErrorMessage {
  type: "stream-error";
  error: string;
  errorType: string;
}

// Union type for workspace chat messages
export type WorkspaceChatMessage = CmuxMessage | CaughtUpMessage | StreamErrorMessage;

// Type guard for caught up messages
export function isCaughtUpMessage(msg: WorkspaceChatMessage): msg is CaughtUpMessage {
  return "type" in msg && msg.type === "caught-up";
}

// Type guard for stream error messages
export function isStreamError(msg: WorkspaceChatMessage): msg is StreamErrorMessage {
  return "type" in msg && msg.type === "stream-error";
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
  providers: {
    setProviderConfig(
      provider: string,
      keyPath: string[],
      value: string
    ): Promise<Result<void, string>>;
  };
  workspace: {
    list(): Promise<WorkspaceMetadata[]>;
    create(
      projectPath: string,
      branchName: string
    ): Promise<{ success: boolean; workspaceId?: string; path?: string; error?: string }>;
    remove(workspaceId: string): Promise<{ success: boolean; error?: string }>;
    sendMessage(workspaceId: string, message: string): Promise<Result<void, SendMessageError>>;
    clearHistory(workspaceId: string): Promise<Result<void, string>>;
    getInfo(workspaceId: string): Promise<WorkspaceMetadata | null>;

    // Event subscriptions (renderer-only)
    // These methods are designed to send current state immediately upon subscription,
    // followed by real-time updates. We deliberately don't provide one-off getters
    // to encourage the renderer to maintain an always up-to-date view of the state
    // through continuous subscriptions rather than polling patterns.
    onChat(workspaceId: string, callback: (data: WorkspaceChatMessage) => void): () => void;
    onClear(workspaceId: string, callback: (data: unknown) => void): () => void;
    onMetadata(
      callback: (data: { workspaceId: string; metadata: WorkspaceMetadata }) => void
    ): () => void;
  };
}

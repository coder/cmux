import type { Result } from "./result";
import type { WorkspaceMetadata } from "./workspace";
import type { CmuxMessage } from "./message";
import type { ProjectConfig } from "@/config";
import type { SendMessageError, StreamErrorType } from "./errors";
import type { ThinkingLevel } from "./thinking";
import type { ToolPolicy } from "@/utils/tools/toolPolicy";
import type { BashToolResult } from "./tools";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  StreamAbortEvent,
  ToolCallStartEvent,
  ToolCallDeltaEvent,
  ToolCallEndEvent,
  ReasoningDeltaEvent,
  ReasoningEndEvent,
} from "./stream";

// Import constants from constants module (single source of truth)
import { IPC_CHANNELS, getChatChannel } from "@/constants/ipc-constants";

// Re-export for TypeScript consumers
export { IPC_CHANNELS, getChatChannel };

// Type for all channel names
export type IPCChannel = string;

// Caught up message type
export interface CaughtUpMessage {
  type: "caught-up";
}

// Stream error message type (for async streaming errors)
export interface StreamErrorMessage {
  type: "stream-error";
  messageId: string;
  error: string;
  errorType: StreamErrorType;
}

// Delete message type (for truncating history)
export interface DeleteMessage {
  type: "delete";
  historySequences: number[];
}

// Union type for workspace chat messages
export type WorkspaceChatMessage =
  | CmuxMessage
  | CaughtUpMessage
  | StreamErrorMessage
  | DeleteMessage
  | StreamStartEvent
  | StreamDeltaEvent
  | StreamEndEvent
  | StreamAbortEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallEndEvent
  | ReasoningDeltaEvent
  | ReasoningEndEvent;

// Type guard for caught up messages
export function isCaughtUpMessage(msg: WorkspaceChatMessage): msg is CaughtUpMessage {
  return "type" in msg && msg.type === "caught-up";
}

// Type guard for stream error messages
export function isStreamError(msg: WorkspaceChatMessage): msg is StreamErrorMessage {
  return "type" in msg && msg.type === "stream-error";
}

// Type guard for delete messages
export function isDeleteMessage(msg: WorkspaceChatMessage): msg is DeleteMessage {
  return "type" in msg && msg.type === "delete";
}

// Type guard for stream start events
export function isStreamStart(msg: WorkspaceChatMessage): msg is StreamStartEvent {
  return "type" in msg && msg.type === "stream-start";
}

// Type guard for stream delta events
export function isStreamDelta(msg: WorkspaceChatMessage): msg is StreamDeltaEvent {
  return "type" in msg && msg.type === "stream-delta";
}

// Type guard for stream end events
export function isStreamEnd(msg: WorkspaceChatMessage): msg is StreamEndEvent {
  return "type" in msg && msg.type === "stream-end";
}

// Type guard for stream abort events
export function isStreamAbort(msg: WorkspaceChatMessage): msg is StreamAbortEvent {
  return "type" in msg && msg.type === "stream-abort";
}

// Type guard for tool call start events
export function isToolCallStart(msg: WorkspaceChatMessage): msg is ToolCallStartEvent {
  return "type" in msg && msg.type === "tool-call-start";
}

// Type guard for tool call delta events
export function isToolCallDelta(msg: WorkspaceChatMessage): msg is ToolCallDeltaEvent {
  return "type" in msg && msg.type === "tool-call-delta";
}

// Type guard for tool call end events
export function isToolCallEnd(msg: WorkspaceChatMessage): msg is ToolCallEndEvent {
  return "type" in msg && msg.type === "tool-call-end";
}

// Type guard for reasoning delta events
export function isReasoningDelta(msg: WorkspaceChatMessage): msg is ReasoningDeltaEvent {
  return "type" in msg && msg.type === "reasoning-delta";
}

// Type guard for reasoning end events
export function isReasoningEnd(msg: WorkspaceChatMessage): msg is ReasoningEndEvent {
  return "type" in msg && msg.type === "reasoning-end";
}

// Options for sendMessage
export interface SendMessageOptions {
  editMessageId?: string;
  thinkingLevel?: ThinkingLevel;
  model: string;
  toolPolicy?: ToolPolicy;
  additionalSystemInstructions?: string;
}

// API method signatures (shared between main and preload)
// We strive to have a small, tight interface between main and the renderer
// to promote good SoC and testing.
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
    list(): Promise<string[]>;
  };
  workspace: {
    list(): Promise<WorkspaceMetadata[]>;
    create(
      projectPath: string,
      branchName: string
    ): Promise<{ success: true; metadata: WorkspaceMetadata } | { success: false; error: string }>;
    remove(workspaceId: string): Promise<{ success: boolean; error?: string }>;
    rename(
      workspaceId: string,
      newName: string
    ): Promise<Result<{ newWorkspaceId: string }, string>>;
    sendMessage(
      workspaceId: string,
      message: string,
      options?: SendMessageOptions
    ): Promise<Result<void, SendMessageError>>;
    truncateHistory(workspaceId: string, percentage?: number): Promise<Result<void, string>>;
    getInfo(workspaceId: string): Promise<WorkspaceMetadata | null>;
    executeBash(
      workspaceId: string,
      script: string,
      options?: { timeout_secs?: number; max_lines?: number; stdin?: string }
    ): Promise<Result<BashToolResult, string>>;

    // Event subscriptions (renderer-only)
    // These methods are designed to send current state immediately upon subscription,
    // followed by real-time updates. We deliberately don't provide one-off getters
    // to encourage the renderer to maintain an always up-to-date view of the state
    // through continuous subscriptions rather than polling patterns.
    onChat(workspaceId: string, callback: (data: WorkspaceChatMessage) => void): () => void;
    onMetadata(
      callback: (data: { workspaceId: string; metadata: WorkspaceMetadata }) => void
    ): () => void;
  };
}

import type { Result } from "./result";
import type { FrontendWorkspaceMetadata, WorkspaceMetadata } from "./workspace";
import type { CmuxMessage, CmuxFrontendMetadata } from "./message";
import type { ProjectConfig } from "@/config";
import type { SendMessageError, StreamErrorType } from "./errors";
import type { ThinkingLevel } from "./thinking";
import type { ToolPolicy } from "@/utils/tools/toolPolicy";
import type { BashToolResult } from "./tools";
import type { Secret } from "./secrets";
import type { CmuxProviderOptions } from "./providerOptions";
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

export interface BranchListResult {
  branches: string[];
  recommendedTrunk: string;
}

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

// Type guard for stream stats events

// Options for sendMessage and resumeStream
export interface SendMessageOptions {
  editMessageId?: string;
  thinkingLevel?: ThinkingLevel;
  model: string;
  toolPolicy?: ToolPolicy;
  additionalSystemInstructions?: string;
  maxOutputTokens?: number;
  providerOptions?: CmuxProviderOptions;
  mode?: string; // Mode name - frontend narrows to specific values, backend accepts any string
  cmuxMetadata?: CmuxFrontendMetadata; // Frontend-defined metadata, backend treats as black-box
}

// API method signatures (shared between main and preload)
// We strive to have a small, tight interface between main and the renderer
// to promote good SoC and testing.
//
// Design principle: IPC methods should be idempotent when possible.
// For example, calling resumeStream on an already-active stream should
// return success (not error), making client code simpler and more resilient.
//
// Minimize the number of methods - use optional parameters for operation variants
// (e.g. remove(id, force?) not remove(id) + removeForce(id)).
export interface IPCApi {
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
  projects: {
    create(projectPath: string): Promise<Result<ProjectConfig, string>>;
    remove(projectPath: string): Promise<Result<void, string>>;
    list(): Promise<Array<[string, ProjectConfig]>>;
    listBranches(projectPath: string): Promise<BranchListResult>;
    secrets: {
      get(projectPath: string): Promise<Secret[]>;
      update(projectPath: string, secrets: Secret[]): Promise<Result<void, string>>;
    };
  };
  workspace: {
    list(): Promise<FrontendWorkspaceMetadata[]>;
    create(
      projectPath: string,
      branchName: string,
      trunkBranch: string
    ): Promise<
      { success: true; metadata: FrontendWorkspaceMetadata } | { success: false; error: string }
    >;
    remove(
      workspaceId: string,
      options?: { force?: boolean }
    ): Promise<{ success: boolean; error?: string }>;
    rename(
      workspaceId: string,
      newName: string
    ): Promise<Result<{ newWorkspaceId: string }, string>>;
    fork(
      sourceWorkspaceId: string,
      newName: string
    ): Promise<
      | { success: true; metadata: WorkspaceMetadata; projectPath: string }
      | { success: false; error: string }
    >;
    sendMessage(
      workspaceId: string,
      message: string,
      options?: SendMessageOptions & { imageParts?: Array<{ url: string; mediaType: string }> }
    ): Promise<Result<void, SendMessageError>>;
    resumeStream(
      workspaceId: string,
      options: SendMessageOptions
    ): Promise<Result<void, SendMessageError>>;
    interruptStream(
      workspaceId: string,
      options?: { abandonPartial?: boolean }
    ): Promise<Result<void, string>>;
    truncateHistory(workspaceId: string, percentage?: number): Promise<Result<void, string>>;
    replaceChatHistory(
      workspaceId: string,
      summaryMessage: CmuxMessage
    ): Promise<Result<void, string>>;
    getInfo(workspaceId: string): Promise<FrontendWorkspaceMetadata | null>;
    executeBash(
      workspaceId: string,
      script: string,
      options?: {
        timeout_secs?: number;
        niceness?: number;
      }
    ): Promise<Result<BashToolResult, string>>;
    openTerminal(workspacePath: string): Promise<void>;

    // Event subscriptions (renderer-only)
    // These methods are designed to send current state immediately upon subscription,
    // followed by real-time updates. We deliberately don't provide one-off getters
    // to encourage the renderer to maintain an always up-to-date view of the state
    // through continuous subscriptions rather than polling patterns.
    onChat(workspaceId: string, callback: (data: WorkspaceChatMessage) => void): () => void;
    onMetadata(
      callback: (data: { workspaceId: string; metadata: FrontendWorkspaceMetadata }) => void
    ): () => void;
  };
  window: {
    setTitle(title: string): Promise<void>;
  };
  update: {
    check(): Promise<void>;
    download(): Promise<void>;
    install(): void;
    onStatus(callback: (status: UpdateStatus) => void): () => void;
  };
  prompts: {
    list(workspaceId: string): Promise<Array<{ name: string; path: string; location: "repo" | "system" }>>;
    read(workspaceId: string, promptName: string): Promise<string | null>;
  };
}

// Update status type (matches updater service)
export type UpdateStatus =
  | { type: "idle" } // Initial state, no check performed yet
  | { type: "checking" }
  | { type: "available"; info: { version: string } }
  | { type: "up-to-date" } // Explicitly checked, no updates available
  | { type: "downloading"; percent: number }
  | { type: "downloaded"; info: { version: string } }
  | { type: "error"; message: string };

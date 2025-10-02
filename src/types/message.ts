import type { UIMessage } from "ai";
import type { LanguageModelV2Usage } from "@ai-sdk/provider";

// Shared provider metadata type for cache statistics and other provider-specific data
export interface ProviderMetadata {
  anthropic?: {
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  [provider: string]: unknown;
}

// Our custom metadata type
export interface CmuxMetadata {
  historySequence?: number; // Assigned by backend for global message ordering (required when writing to history)
  streamingId?: string;
  cost?: number;
  tokens?: number;
  usage?: LanguageModelV2Usage;
  duration?: number;
  timestamp?: number;
  model?: string;
  providerMetadata?: ProviderMetadata;
  systemMessageTokens?: number; // Token count for system message sent with this request
  reasoningTokens?: number; // Token count for reasoning (stats only)
  partial?: boolean; // Whether this message was interrupted and is incomplete
  synthetic?: boolean; // Whether this message was synthetically generated (e.g., [INTERRUPTED] sentinel)
}

// Extended tool part type that supports interrupted tool calls (input-available state)
// Standard AI SDK ToolUIPart only supports output-available (completed tools)
export interface CmuxToolPart {
  type: "dynamic-tool";
  toolCallId: string;
  toolName: string;
  state: "input-available" | "output-available";
  input: unknown;
  output?: unknown;
}

// Text part type
export interface CmuxTextPart {
  type: "text";
  text: string;
}

// Reasoning part type for extended thinking content
export interface CmuxReasoningPart {
  type: "reasoning";
  text: string;
}

// CmuxMessage extends UIMessage with our metadata and custom parts
// Supports text, reasoning, and tool parts (including interrupted tool calls)
export type CmuxMessage = Omit<UIMessage<CmuxMetadata, never, never>, "parts"> & {
  parts: Array<CmuxTextPart | CmuxReasoningPart | CmuxToolPart>;
};

// DisplayedMessage represents a single UI message block
// This is what the UI components consume, splitting complex messages into separate visual blocks
export type DisplayedMessage =
  | {
      type: "user";
      id: string; // Display ID for UI/React keys
      historyId: string; // Original CmuxMessage ID for history operations
      content: string;
      historySequence: number; // Global ordering across all messages
      timestamp?: number;
    }
  | {
      type: "assistant";
      id: string; // Display ID for UI/React keys
      historyId: string; // Original CmuxMessage ID for history operations
      content: string;
      historySequence: number; // Global ordering across all messages
      streamSequence?: number; // Local ordering within this assistant message
      isStreaming: boolean;
      isPartial: boolean; // Whether this message was interrupted
      isLastPartOfMessage?: boolean; // True if this is the last part of a multi-part message
      model?: string;
      timestamp?: number;
      tokens?: number;
    }
  | {
      type: "tool";
      id: string; // Display ID for UI/React keys
      historyId: string; // Original CmuxMessage ID for history operations
      toolCallId: string;
      toolName: string;
      args: unknown;
      result?: unknown;
      status: "pending" | "executing" | "completed" | "failed" | "interrupted";
      isPartial: boolean; // Whether the parent message was interrupted
      historySequence: number; // Global ordering across all messages
      streamSequence?: number; // Local ordering within this assistant message
      isLastPartOfMessage?: boolean; // True if this is the last part of a multi-part message
      timestamp?: number;
    }
  | {
      type: "reasoning";
      id: string; // Display ID for UI/React keys
      historyId: string; // Original CmuxMessage ID for history operations
      content: string;
      historySequence: number; // Global ordering across all messages
      streamSequence?: number; // Local ordering within this assistant message
      isStreaming: boolean;
      isPartial: boolean; // Whether the parent message was interrupted
      isLastPartOfMessage?: boolean; // True if this is the last part of a multi-part message
      timestamp?: number;
      tokens?: number; // Reasoning tokens if available
    };

// Helper to create a simple text message
export function createCmuxMessage(
  id: string,
  role: "user" | "assistant",
  content: string,
  metadata?: CmuxMetadata,
  additionalParts?: CmuxMessage["parts"]
): CmuxMessage {
  const textPart = content
    ? [{ type: "text" as const, text: content, state: "done" as const }]
    : [];
  const parts = [...textPart, ...(additionalParts ?? [])];

  // Validation: User messages must have at least one part with content
  // This prevents empty user messages from being created (defense-in-depth)
  if (role === "user" && parts.length === 0) {
    throw new Error(
      "Cannot create user message with no parts. Empty messages should be rejected upstream."
    );
  }

  return {
    id,
    role,
    metadata,
    parts,
  };
}

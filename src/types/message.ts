import type { UIMessage } from "ai";
import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import type { StreamErrorType } from "./errors";
import type { ToolPolicy } from "@/utils/tools/toolPolicy";

// Our custom metadata type
export interface CmuxMetadata {
  historySequence?: number; // Assigned by backend for global message ordering (required when writing to history)
  duration?: number;
  timestamp?: number;
  model?: string;
  usage?: LanguageModelV2Usage; // AI SDK normalized usage (verbatim from streamResult.usage)
  providerMetadata?: Record<string, unknown>; // Raw AI SDK provider data
  systemMessageTokens?: number; // Token count for system message sent with this request (calculated by AIService)
  partial?: boolean; // Whether this message was interrupted and is incomplete
  synthetic?: boolean; // Whether this message was synthetically generated (e.g., [CONTINUE] sentinel)
  error?: string; // Error message if stream failed
  errorType?: StreamErrorType; // Error type/category if stream failed
  compacted?: boolean; // Whether this message is a compacted summary of previous history
  toolPolicy?: ToolPolicy; // Tool policy active when this message was sent (user messages only)
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
  timestamp?: number; // When the tool call was emitted
}

// Text part type
export interface CmuxTextPart {
  type: "text";
  text: string;
  timestamp?: number;
}

// Reasoning part type for extended thinking content
export interface CmuxReasoningPart {
  type: "reasoning";
  text: string;
  timestamp?: number;
}

// Image part type for multimodal messages
export interface CmuxImagePart {
  type: "image";
  image: string | Uint8Array | ArrayBuffer | URL; // base64 string or binary data or URL
  mimeType?: string; // e.g., "image/png", "image/jpeg"
}

// CmuxMessage extends UIMessage with our metadata and custom parts
// Supports text, reasoning, image, and tool parts (including interrupted tool calls)
export type CmuxMessage = Omit<UIMessage<CmuxMetadata, never, never>, "parts"> & {
  parts: Array<CmuxTextPart | CmuxReasoningPart | CmuxImagePart | CmuxToolPart>;
};

// DisplayedMessage represents a single UI message block
// This is what the UI components consume, splitting complex messages into separate visual blocks
export type DisplayedMessage =
  | {
      type: "user";
      id: string; // Display ID for UI/React keys
      historyId: string; // Original CmuxMessage ID for history operations
      content: string;
      imageParts?: Array<{ image: string; mimeType?: string }>; // Optional image attachments
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
      isCompacted: boolean; // Whether this is a compacted summary
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
    }
  | {
      type: "stream-error";
      id: string; // Display ID for UI/React keys
      historyId: string; // Original CmuxMessage ID for history operations
      error: string; // Error message
      errorType: StreamErrorType; // Error type/category
      historySequence: number; // Global ordering across all messages
      timestamp?: number;
      model?: string;
    }
  | {
      type: "history-hidden";
      id: string; // Display ID for UI/React keys
      hiddenCount: number; // Number of messages hidden
      historySequence: number; // Global ordering across all messages
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

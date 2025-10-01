import type { UIMessage, ToolUIPart } from "ai";
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
}

// CmuxMessage extends UIMessage with our metadata
// Supports text parts and tool parts (for tool calls and results)
export type CmuxMessage = UIMessage<CmuxMetadata, ToolUIPart, never>;

// DisplayedMessage represents a single UI message block
// This is what the UI components consume, splitting complex messages into separate visual blocks
export type DisplayedMessage =
  | {
      type: "user";
      id: string;
      content: string;
      historySequence: number; // Global ordering across all messages
      timestamp?: number;
    }
  | {
      type: "assistant";
      id: string;
      content: string;
      historySequence: number; // Global ordering across all messages
      streamSequence?: number; // Local ordering within this assistant message
      isStreaming: boolean;
      model?: string;
      timestamp?: number;
      tokens?: number;
    }
  | {
      type: "tool";
      id: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
      result?: unknown;
      status: "pending" | "executing" | "completed" | "failed";
      historySequence: number; // Global ordering across all messages
      streamSequence?: number; // Local ordering within this assistant message
      timestamp?: number;
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
  const parts = [...textPart, ...(additionalParts || [])];

  return {
    id,
    role,
    metadata,
    parts,
  };
}

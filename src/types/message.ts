import type { UIMessage, ToolUIPart } from "ai";
import type { LanguageModelV2Usage } from "@ai-sdk/provider";

// Our custom metadata type
export interface CmuxMetadata {
  sequenceNumber: number;
  streamingId?: string;
  cost?: number;
  tokens?: number;
  usage?: LanguageModelV2Usage;
  duration?: number;
  timestamp?: number;
  model?: string;
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
      sequenceNumber: number;
      timestamp?: number;
    }
  | {
      type: "assistant";
      id: string;
      content: string;
      sequenceNumber: number;
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
      sequenceNumber: number;
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

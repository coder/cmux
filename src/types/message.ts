import type { UIMessage } from "ai";

// Our custom metadata type
export interface CmuxMetadata {
  sequenceNumber: number;
  streamingId?: string;
  cost?: number;
  tokens?: number;
  duration?: number;
  timestamp?: number;
}

// CmuxMessage extends UIMessage with our metadata
// For Phase 1, we only use text parts (no tools or custom data)
export type CmuxMessage = UIMessage<CmuxMetadata, never, never>;

// Helper to create a simple text message
export function createCmuxMessage(
  id: string,
  role: "user" | "assistant",
  content: string,
  metadata?: CmuxMetadata
): CmuxMessage {
  return {
    id,
    role,
    metadata,
    parts: [{ type: "text", text: content, state: "done" }],
  };
}

export interface StreamingContext {
  streamingId: string;
  messageId: string;
  contentParts: string[];
  startTime: number;
  isComplete: boolean;
}

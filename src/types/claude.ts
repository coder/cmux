import type { UIPermissionMode } from "./global";

// Cmux-specific metadata added to SDK messages
export interface CmuxMetadata {
  permissionMode: UIPermissionMode;
  sequenceNumber: number; // Our own sequence counter for proper message ordering
}

// Clean data model without presentation concerns
export interface Message {
  id: string;
  type: "user" | "assistant" | "system" | "result" | "tool_use" | "tool_result";
  content?: any; // Raw content, can be string, array, or structured data
  contentDeltas?: string[]; // Raw delta array for streaming messages
  isStreaming?: boolean;
  metadata?: {
    originalSDKMessage?: any;
    streamingId?: string;
    cost?: number;
    tokens?: number;
    duration?: number;
    toolName?: string; // For tool_use messages
    toolInput?: any; // For tool_use messages
    eventType?: string; // For stream_event messages
    cmuxMeta?: CmuxMetadata; // Our custom metadata
  };
  sequenceNumber: number;
  timestamp: number;
}

// Enhanced interface for UI layer with additional associations
export interface UIMessage extends Message {
  // Tool result association fields
  toolUseId?: string; // Links tool_result to its corresponding tool_use
  toolResult?: {
    // Store result data for tool_result messages
    content: string;
    is_error: boolean;
  };
  // Associated tool use data (for tool_result messages)
  associatedToolUse?: {
    name: string;
    input: any;
  };
}

export interface StreamingContext {
  streamingId: string;
  messageId: string;
  contentParts: string[];
  startTime: number;
  isComplete: boolean;
}

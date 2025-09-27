import type { UIPermissionMode } from "./global";
import type { SDKMessage } from "@anthropic-ai/claude-code";

// Cmux-specific metadata added to SDK messages
export interface CmuxMetadata {
  permissionMode: UIPermissionMode;
  sequenceNumber: number; // Our own sequence counter for proper message ordering
}

// Message as persisted in history - SDK message plus our metadata at top level
export type HistoryMessage = SDKMessage & {
  cmuxMeta: CmuxMetadata;
};

// Clean data model without presentation concerns
export interface Message {
  id: string;
  type: "user" | "assistant" | "system" | "result" | "tool_use" | "tool_result";
  content?: any; // Raw content, can be string, array, or structured data
  contentDeltas?: string[]; // Raw delta array for streaming messages
  isStreaming?: boolean;
  metadata: {
    originalSDKMessage?: SDKMessage; // Full SDK message for components that need it
    streamingId?: string;
    cost?: number;
    tokens?: number;
    duration?: number;
    toolName?: string; // For tool_use messages
    toolInput?: any; // For tool_use messages
    eventType?: string; // For stream_event messages
    cmuxMeta: CmuxMetadata; // Always present - our custom metadata

    // Extracted fields from specific SDK message types
    // System message fields
    systemSubtype?: string; // 'init' | 'compact_boundary'
    systemModel?: string;
    systemTools?: string[];
    systemSlashCommands?: string[];
    compactMetadata?: {
      trigger: "manual" | "auto";
      pre_tokens: number;
    };

    // Result message fields
    resultIsError?: boolean;
    resultSubtype?: string; // 'success' | 'error_max_turns' | 'error_during_execution'
    resultText?: string;

    // Assistant message fields (already have the content extracted properly)
  };
  timestamp: number;
}

// Enhanced interface for UI layer with additional associations
export interface UIMessage extends Message {
  // Model tracking for display (e.g., "claude-opus-4-1-20250805")
  model?: string;
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

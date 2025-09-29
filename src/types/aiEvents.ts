/**
 * Event types emitted by AIService
 */

export interface StreamStartEvent {
  type: "stream-start";
  workspaceId: string;
  messageId: string;
  model: string;
}

export interface StreamDeltaEvent {
  type: "stream-delta";
  workspaceId: string;
  messageId: string;
  delta: string;
}

export interface StreamEndEvent {
  type: "stream-end";
  workspaceId: string;
  messageId: string;
  content: string;
  usage?: {
    totalTokens: number;
  };
  model: string;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    output?: unknown;
  }>;
}

export interface ErrorEvent {
  type: "error";
  workspaceId: string;
  error: string;
  errorType?: string;
}

// Tool call events
export interface ToolCallStartEvent {
  type: "tool-call-start";
  workspaceId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolCallDeltaEvent {
  type: "tool-call-delta";
  workspaceId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  delta: unknown;
}

export interface ToolCallEndEvent {
  type: "tool-call-end";
  workspaceId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export type AIServiceEvent =
  | StreamStartEvent
  | StreamDeltaEvent
  | StreamEndEvent
  | ErrorEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallEndEvent;

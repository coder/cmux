/**
 * Event types emitted by AIService
 */

export interface StreamStartEvent {
  type: "stream-start";
  workspaceId: string;
  messageId: string;
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
}

export interface ErrorEvent {
  type: "error";
  workspaceId: string;
  error: string;
}

export type AIServiceEvent = StreamStartEvent | StreamDeltaEvent | StreamEndEvent | ErrorEvent;

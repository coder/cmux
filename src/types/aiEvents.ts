/**
 * Event types emitted by AIService
 */

import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import type { ProviderMetadata } from "./message";

/**
 * Completed message part (text or tool) suitable for serialization
 * Used in StreamEndEvent and partial message storage
 */
export type CompletedMessagePart =
  | { type: "text"; text: string; state: "done" }
  | {
      type: "dynamic-tool";
      toolCallId: string;
      toolName: string;
      state: "input-available" | "output-available";
      input: unknown;
      output?: unknown;
    };

export interface StreamStartEvent {
  type: "stream-start";
  workspaceId: string;
  messageId: string;
  model: string;
  historySequence: number; // Backend assigns global message ordering
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
  // Structured metadata from backend - directly mergeable with CmuxMetadata
  metadata: {
    usage?: LanguageModelV2Usage;
    tokens?: number;
    model: string;
    providerMetadata?: ProviderMetadata;
  };
  // Parts array preserves temporal ordering of text and tool calls
  parts: CompletedMessagePart[];
}

export interface StreamAbortEvent {
  type: "stream-abort";
  workspaceId: string;
  messageId: string;
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

// Reasoning events
export interface ReasoningStartEvent {
  type: "reasoning-start";
  workspaceId: string;
  messageId: string;
}

export interface ReasoningDeltaEvent {
  type: "reasoning-delta";
  workspaceId: string;
  messageId: string;
  delta: string;
}

export interface ReasoningEndEvent {
  type: "reasoning-end";
  workspaceId: string;
  messageId: string;
}

export type AIServiceEvent =
  | StreamStartEvent
  | StreamDeltaEvent
  | StreamEndEvent
  | ErrorEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallEndEvent
  | ReasoningStartEvent
  | ReasoningDeltaEvent
  | ReasoningEndEvent;

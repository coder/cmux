/**
 * Event types emitted by AIService
 */

import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import type { CmuxReasoningPart, CmuxTextPart, CmuxToolPart } from "./message";
import type { StreamErrorType } from "./errors";

/**
 * Completed message part (reasoning, text, or tool) suitable for serialization
 * Used in StreamEndEvent and partial message storage
 */
export type CompletedMessagePart = CmuxReasoningPart | CmuxTextPart | CmuxToolPart;

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
    model: string;
    usage?: LanguageModelV2Usage;
    providerMetadata?: Record<string, unknown>;
    duration?: number;
    systemMessageTokens?: number;
  };
  // Parts array preserves temporal ordering of reasoning, text, and tool calls
  parts: CompletedMessagePart[];
}

export interface StreamAbortEvent {
  type: "stream-abort";
  workspaceId: string;
  messageId: string;
  // Metadata may contain usage if abort occurred after stream completed processing
  metadata?: {
    usage?: LanguageModelV2Usage;
    duration?: number;
  };
}

export interface ErrorEvent {
  type: "error";
  workspaceId: string;
  messageId: string;
  error: string;
  errorType?: StreamErrorType;
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

export interface StreamStatsEvent {
  type: "stream-stats";
  workspaceId: string;
  messageId: string;
  tokenCount: number;
  tps: number;
}

export type AIServiceEvent =
  | StreamStartEvent
  | StreamDeltaEvent
  | StreamEndEvent
  | StreamAbortEvent
  | ErrorEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallEndEvent
  | ReasoningStartEvent
  | ReasoningDeltaEvent
  | ReasoningEndEvent
  | StreamStatsEvent;

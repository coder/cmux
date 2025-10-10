import type { CompletedMessagePart } from "@/types/stream";
import type { StreamErrorType } from "@/types/errors";
import type { ThinkingLevel } from "@/types/thinking";

export type MockEventKind =
  | "stream-start"
  | "stream-delta"
  | "stream-end"
  | "stream-error"
  | "reasoning-delta"
  | "tool-start"
  | "tool-end";

export interface MockAssistantEventBase {
  kind: MockEventKind;
  delay: number;
}

export interface MockStreamStartEvent extends MockAssistantEventBase {
  kind: "stream-start";
  messageId: string;
  model: string;
}

export interface MockStreamDeltaEvent extends MockAssistantEventBase {
  kind: "stream-delta";
  text: string;
}

export interface MockStreamEndEvent extends MockAssistantEventBase {
  kind: "stream-end";
  metadata: {
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    systemMessageTokens?: number;
  };
  parts: CompletedMessagePart[];
}

export interface MockStreamErrorEvent extends MockAssistantEventBase {
  kind: "stream-error";
  error: string;
  errorType: StreamErrorType;
}

export interface MockReasoningEvent extends MockAssistantEventBase {
  kind: "reasoning-delta";
  text: string;
}

export interface MockToolStartEvent extends MockAssistantEventBase {
  kind: "tool-start";
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface MockToolEndEvent extends MockAssistantEventBase {
  kind: "tool-end";
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export type MockAssistantEvent =
  | MockStreamStartEvent
  | MockStreamDeltaEvent
  | MockStreamEndEvent
  | MockStreamErrorEvent
  | MockReasoningEvent
  | MockToolStartEvent
  | MockToolEndEvent;

export interface ScenarioTurn {
  user: {
    text: string;
    thinkingLevel: ThinkingLevel;
    mode: "plan" | "exec";
    editOfTurn?: number;
  };
  assistant: {
    messageId: string;
    events: MockAssistantEvent[];
  };
}

export const STREAM_BASE_DELAY = 250;

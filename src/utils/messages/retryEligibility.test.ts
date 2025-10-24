import { describe, it, expect } from "@jest/globals";
import { hasInterruptedStream } from "./retryEligibility";
import type { DisplayedMessage } from "@/types/message";

describe("hasInterruptedStream", () => {
  it("returns false for empty messages", () => {
    expect(hasInterruptedStream([])).toBe(false);
  });

  it("returns true for stream-error message", () => {
    const messages: DisplayedMessage[] = [
      {
        type: "user",
        id: "user-1",
        historyId: "user-1",
        content: "Hello",
        historySequence: 1,
      },
      {
        type: "stream-error",
        id: "error-1",
        historyId: "assistant-1",
        error: "Connection failed",
        errorType: "network",
        historySequence: 2,
      },
    ];
    expect(hasInterruptedStream(messages)).toBe(true);
  });

  it("returns true for partial assistant message", () => {
    const messages: DisplayedMessage[] = [
      {
        type: "user",
        id: "user-1",
        historyId: "user-1",
        content: "Hello",
        historySequence: 1,
      },
      {
        type: "assistant",
        id: "assistant-1",
        historyId: "assistant-1",
        content: "Incomplete response",
        historySequence: 2,
        streamSequence: 0,
        isStreaming: false,
        isPartial: true,
        isLastPartOfMessage: true,
        isCompacted: false,
      },
    ];
    expect(hasInterruptedStream(messages)).toBe(true);
  });

  it("returns true for partial tool message", () => {
    const messages: DisplayedMessage[] = [
      {
        type: "user",
        id: "user-1",
        historyId: "user-1",
        content: "Hello",
        historySequence: 1,
      },
      {
        type: "tool",
        id: "tool-1",
        historyId: "assistant-1",
        toolName: "bash",
        toolCallId: "call-1",
        args: { script: "echo test" },
        status: "interrupted",
        isPartial: true,
        historySequence: 2,
        streamSequence: 0,
        isLastPartOfMessage: true,
      },
    ];
    expect(hasInterruptedStream(messages)).toBe(true);
  });

  it("returns true for partial reasoning message", () => {
    const messages: DisplayedMessage[] = [
      {
        type: "user",
        id: "user-1",
        historyId: "user-1",
        content: "Hello",
        historySequence: 1,
      },
      {
        type: "reasoning",
        id: "reasoning-1",
        historyId: "assistant-1",
        content: "Let me think...",
        historySequence: 2,
        streamSequence: 0,
        isStreaming: false,
        isPartial: true,
        isLastPartOfMessage: true,
      },
    ];
    expect(hasInterruptedStream(messages)).toBe(true);
  });

  it("returns false for completed messages", () => {
    const messages: DisplayedMessage[] = [
      {
        type: "user",
        id: "user-1",
        historyId: "user-1",
        content: "Hello",
        historySequence: 1,
      },
      {
        type: "assistant",
        id: "assistant-1",
        historyId: "assistant-1",
        content: "Complete response",
        historySequence: 2,
        streamSequence: 0,
        isStreaming: false,
        isPartial: false,
        isLastPartOfMessage: true,
        isCompacted: false,
      },
    ];
    expect(hasInterruptedStream(messages)).toBe(false);
  });

  it("returns true when last message is user message sent >2s ago (app restarted during slow model)", () => {
    const oldTimestamp = Date.now() - 5000; // 5 seconds ago
    const messages: DisplayedMessage[] = [
      {
        type: "user",
        id: "user-1",
        historyId: "user-1",
        content: "Hello",
        historySequence: 1,
      },
      {
        type: "assistant",
        id: "assistant-1",
        historyId: "assistant-1",
        content: "Complete response",
        historySequence: 2,
        streamSequence: 0,
        isStreaming: false,
        isPartial: false,
        isLastPartOfMessage: true,
        isCompacted: false,
      },
      {
        type: "user",
        id: "user-2",
        historyId: "user-2",
        content: "Another question",
        historySequence: 3,
        timestamp: oldTimestamp,
      },
    ];
    expect(hasInterruptedStream(messages)).toBe(true);
  });

  it("returns false when last message is very recent user message (<2s)", () => {
    const recentTimestamp = Date.now() - 500; // 500ms ago
    const messages: DisplayedMessage[] = [
      {
        type: "user",
        id: "user-1",
        historyId: "user-1",
        content: "Hello",
        historySequence: 1,
      },
      {
        type: "assistant",
        id: "assistant-1",
        historyId: "assistant-1",
        content: "Complete response",
        historySequence: 2,
        streamSequence: 0,
        isStreaming: false,
        isPartial: false,
        isLastPartOfMessage: true,
        isCompacted: false,
      },
      {
        type: "user",
        id: "user-2",
        historyId: "user-2",
        content: "Another question",
        historySequence: 3,
        timestamp: recentTimestamp,
      },
    ];
    expect(hasInterruptedStream(messages)).toBe(false);
  });

  it("returns true when user message has no response sent >2s ago (slow model scenario)", () => {
    const oldTimestamp = Date.now() - 3000; // 3 seconds ago
    const messages: DisplayedMessage[] = [
      {
        type: "user",
        id: "user-1",
        historyId: "user-1",
        content: "Hello",
        historySequence: 1,
        timestamp: oldTimestamp,
      },
    ];
    expect(hasInterruptedStream(messages)).toBe(true);
  });

  it("returns false when user message was just sent (<2s ago)", () => {
    const recentTimestamp = Date.now() - 1000; // 1 second ago
    const messages: DisplayedMessage[] = [
      {
        type: "user",
        id: "user-1",
        historyId: "user-1",
        content: "Hello",
        historySequence: 1,
        timestamp: recentTimestamp,
      },
    ];
    expect(hasInterruptedStream(messages)).toBe(false);
  });
});

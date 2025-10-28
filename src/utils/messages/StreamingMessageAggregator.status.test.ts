import { describe, it, expect } from "bun:test";
import { StreamingMessageAggregator } from "./StreamingMessageAggregator";

describe("StreamingMessageAggregator - Agent Status", () => {
  it("should start with undefined agent status", () => {
    const aggregator = new StreamingMessageAggregator("2024-01-01T00:00:00.000Z");
    expect(aggregator.getAgentStatus()).toBeUndefined();
  });

  it("should update agent status when status_set tool succeeds", () => {
    const aggregator = new StreamingMessageAggregator("2024-01-01T00:00:00.000Z");
    const messageId = "msg1";
    const toolCallId = "tool1";

    // Start a stream
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "workspace1",
      messageId,
      model: "test-model",
      historySequence: 1,
    });

    // Add a status_set tool call
    aggregator.handleToolCallStart({
      type: "tool-call-start",
      workspaceId: "workspace1",
      messageId,
      toolCallId,
      toolName: "status_set",
      args: { emoji: "🔍", message: "Analyzing code" },
      tokens: 10,
      timestamp: Date.now(),
    });

    // Complete the tool call
    aggregator.handleToolCallEnd({
      type: "tool-call-end",
      workspaceId: "workspace1",
      messageId,
      toolCallId,
      toolName: "status_set",
      result: { success: true, emoji: "🔍", message: "Analyzing code" },
    });

    const status = aggregator.getAgentStatus();
    expect(status).toBeDefined();
    expect(status?.emoji).toBe("🔍");
    expect(status?.message).toBe("Analyzing code");
  });

  it("should update agent status multiple times", () => {
    const aggregator = new StreamingMessageAggregator("2024-01-01T00:00:00.000Z");
    const messageId = "msg1";

    // Start a stream
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "workspace1",
      messageId,
      model: "test-model",
      historySequence: 1,
    });

    // First status_set
    aggregator.handleToolCallStart({
      type: "tool-call-start",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool1",
      toolName: "status_set",
      args: { emoji: "🔍", message: "Analyzing" },
      tokens: 10,
      timestamp: Date.now(),
    });

    aggregator.handleToolCallEnd({
      type: "tool-call-end",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool1",
      toolName: "status_set",
      result: { success: true, emoji: "🔍", message: "Analyzing" },
    });

    expect(aggregator.getAgentStatus()?.emoji).toBe("🔍");

    // Second status_set
    aggregator.handleToolCallStart({
      type: "tool-call-start",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool2",
      toolName: "status_set",
      args: { emoji: "📝", message: "Writing" },
      tokens: 10,
      timestamp: Date.now(),
    });

    aggregator.handleToolCallEnd({
      type: "tool-call-end",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool2",
      toolName: "status_set",
      result: { success: true, emoji: "📝", message: "Writing" },
    });

    expect(aggregator.getAgentStatus()?.emoji).toBe("📝");
    expect(aggregator.getAgentStatus()?.message).toBe("Writing");
  });

  it("should persist agent status after stream ends", () => {
    const aggregator = new StreamingMessageAggregator("2024-01-01T00:00:00.000Z");
    const messageId = "msg1";

    // Start a stream
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "workspace1",
      messageId,
      model: "test-model",
      historySequence: 1,
    });

    // Set status
    aggregator.handleToolCallStart({
      type: "tool-call-start",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool1",
      toolName: "status_set",
      args: { emoji: "🔍", message: "Working" },
      tokens: 10,
      timestamp: Date.now(),
    });

    aggregator.handleToolCallEnd({
      type: "tool-call-end",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool1",
      toolName: "status_set",
      result: { success: true, emoji: "🔍", message: "Working" },
    });

    expect(aggregator.getAgentStatus()).toBeDefined();

    // End the stream
    aggregator.handleStreamEnd({
      type: "stream-end",
      workspaceId: "workspace1",
      messageId,
      metadata: { model: "test-model" },
      parts: [],
    });

    // Status should persist after stream ends (unlike todos)
    expect(aggregator.getAgentStatus()).toBeDefined();
    expect(aggregator.getAgentStatus()?.emoji).toBe("🔍");
  });

  it("should not update agent status if tool call fails", () => {
    const aggregator = new StreamingMessageAggregator("2024-01-01T00:00:00.000Z");
    const messageId = "msg1";

    // Start a stream
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "workspace1",
      messageId,
      model: "test-model",
      historySequence: 1,
    });

    // Add a status_set tool call
    aggregator.handleToolCallStart({
      type: "tool-call-start",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool1",
      toolName: "status_set",
      args: { emoji: "🔍", message: "Analyzing" },
      tokens: 10,
      timestamp: Date.now(),
    });

    // Complete with failure
    aggregator.handleToolCallEnd({
      type: "tool-call-end",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool1",
      toolName: "status_set",
      result: { success: false, error: "Something went wrong" },
    });

    // Status should remain undefined
    expect(aggregator.getAgentStatus()).toBeUndefined();
  });

  it("should clear agent status on stream-start (different from TODO behavior)", () => {
    const aggregator = new StreamingMessageAggregator("2024-01-01T00:00:00.000Z");

    // Start first stream and set status
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "workspace1",
      messageId: "msg1",
      model: "test-model",
      historySequence: 1,
    });

    aggregator.handleToolCallStart({
      type: "tool-call-start",
      workspaceId: "workspace1",
      messageId: "msg1",
      toolCallId: "tool1",
      toolName: "status_set",
      args: { emoji: "🔍", message: "First task" },
      tokens: 10,
      timestamp: Date.now(),
    });

    aggregator.handleToolCallEnd({
      type: "tool-call-end",
      workspaceId: "workspace1",
      messageId: "msg1",
      toolCallId: "tool1",
      toolName: "status_set",
      result: { success: true, emoji: "🔍", message: "First task" },
    });

    expect(aggregator.getAgentStatus()?.message).toBe("First task");

    // End first stream
    aggregator.handleStreamEnd({
      type: "stream-end",
      workspaceId: "workspace1",
      messageId: "msg1",
      metadata: { model: "test-model" },
      parts: [],
    });

    // Status persists after stream ends
    expect(aggregator.getAgentStatus()?.message).toBe("First task");

    // Start a NEW stream - status should be cleared
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "workspace1",
      messageId: "msg2",
      model: "test-model",
      historySequence: 2,
    });

    // Status should be cleared on new stream start
    expect(aggregator.getAgentStatus()).toBeUndefined();
  });

  it("should show 'failed' status in UI when status_set validation fails", () => {
    const aggregator = new StreamingMessageAggregator("2024-01-01T00:00:00.000Z");
    const messageId = "msg1";

    // Start a stream
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "workspace1",
      messageId,
      model: "test-model",
      historySequence: 1,
    });

    // Add a status_set tool call with invalid emoji
    aggregator.handleToolCallStart({
      type: "tool-call-start",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool1",
      toolName: "status_set",
      args: { emoji: "not-an-emoji", message: "test" },
      tokens: 10,
      timestamp: Date.now(),
    });

    // Complete with validation failure
    aggregator.handleToolCallEnd({
      type: "tool-call-end",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool1",
      toolName: "status_set",
      result: { success: false, error: "emoji must be a single emoji character" },
    });

    // End the stream to finalize message
    aggregator.handleStreamEnd({
      type: "stream-end",
      workspaceId: "workspace1",
      messageId,
      metadata: { model: "test-model" },
      parts: [],
    });

    // Check that the tool message shows 'failed' status in the UI
    const displayedMessages = aggregator.getDisplayedMessages();
    const toolMessage = displayedMessages.find((m) => m.type === "tool");
    expect(toolMessage).toBeDefined();
    expect(toolMessage?.type).toBe("tool");
    if (toolMessage?.type === "tool") {
      expect(toolMessage.status).toBe("failed");
      expect(toolMessage.toolName).toBe("status_set");
    }

    // And status should NOT be updated in aggregator
    expect(aggregator.getAgentStatus()).toBeUndefined();
  });

  it("should show 'completed' status in UI when status_set validation succeeds", () => {
    const aggregator = new StreamingMessageAggregator("2024-01-01T00:00:00.000Z");
    const messageId = "msg1";

    // Start a stream
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "workspace1",
      messageId,
      model: "test-model",
      historySequence: 1,
    });

    // Add a successful status_set tool call
    aggregator.handleToolCallStart({
      type: "tool-call-start",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool1",
      toolName: "status_set",
      args: { emoji: "🔍", message: "Analyzing code" },
      tokens: 10,
      timestamp: Date.now(),
    });

    // Complete successfully
    aggregator.handleToolCallEnd({
      type: "tool-call-end",
      workspaceId: "workspace1",
      messageId,
      toolCallId: "tool1",
      toolName: "status_set",
      result: { success: true, emoji: "🔍", message: "Analyzing code" },
    });

    // End the stream to finalize message
    aggregator.handleStreamEnd({
      type: "stream-end",
      workspaceId: "workspace1",
      messageId,
      metadata: { model: "test-model" },
      parts: [],
    });

    // Check that the tool message shows 'completed' status in the UI
    const displayedMessages = aggregator.getDisplayedMessages();
    const toolMessage = displayedMessages.find((m) => m.type === "tool");
    expect(toolMessage).toBeDefined();
    expect(toolMessage?.type).toBe("tool");
    if (toolMessage?.type === "tool") {
      expect(toolMessage.status).toBe("completed");
      expect(toolMessage.toolName).toBe("status_set");
    }

    // And status SHOULD be updated in aggregator
    const status = aggregator.getAgentStatus();
    expect(status).toBeDefined();
    expect(status?.emoji).toBe("🔍");
    expect(status?.message).toBe("Analyzing code");
  });
});

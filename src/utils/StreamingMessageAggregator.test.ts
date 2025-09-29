import { describe, it, expect } from "bun:test";
import { StreamingMessageAggregator } from "./StreamingMessageAggregator";
import type { StreamEndEvent } from "../types/aiEvents";
import type { DynamicToolPart } from "../types/toolParts";

describe("StreamingMessageAggregator", () => {
  it("should preserve temporal ordering of text and tool parts", () => {
    const aggregator = new StreamingMessageAggregator();

    // Simulate a stream-end event with interleaved content
    const streamEndEvent: StreamEndEvent = {
      type: "stream-end",
      workspaceId: "test-ws",
      messageId: "msg-1",
      model: "claude-3",
      parts: [
        { type: "text", text: "Let me check the weather for you.", state: "done" },
        {
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "getWeather",
          state: "output-available",
          input: { city: "SF" },
          output: { temp: 72 },
        },
      ],
    };

    // Process the event
    aggregator.handleStreamEnd(streamEndEvent);

    // Get the resulting message
    const messages = aggregator.getAllMessages();
    expect(messages).toHaveLength(1);

    const message = messages[0];
    expect(message.parts).toHaveLength(2);

    // Verify temporal order: text first, then tool
    expect(message.parts[0].type).toBe("text");
    if (message.parts[0].type === "text") {
      expect(message.parts[0].text).toBe("Let me check the weather for you.");
    }

    expect(message.parts[1].type).toBe("dynamic-tool");
    const toolPart = message.parts[1] as DynamicToolPart;
    expect(toolPart.toolName).toBe("getWeather");
  });

  it("should split messages into DisplayedMessages correctly", () => {
    const aggregator = new StreamingMessageAggregator();

    // Add a user message
    aggregator.handleMessage({
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Hello world", state: "done" }],
      metadata: { sequenceNumber: 0 },
    });

    // Add an assistant message with text and tool
    const streamEndEvent: StreamEndEvent = {
      type: "stream-end",
      workspaceId: "test-ws",
      messageId: "assistant-1",
      model: "claude-3",
      parts: [
        { type: "text", text: "I'll help you with that.", state: "done" },
        {
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "searchFiles",
          state: "output-available",
          input: { pattern: "*.ts" },
          output: ["file1.ts", "file2.ts"],
        },
      ],
    };
    aggregator.handleStreamEnd(streamEndEvent);

    // Get DisplayedMessages
    const displayedMessages = aggregator.getDisplayedMessages();

    // Should have 3 messages: user, assistant text, tool
    expect(displayedMessages).toHaveLength(3);

    // Check user message
    expect(displayedMessages[0].type).toBe("user");
    if (displayedMessages[0].type === "user") {
      expect(displayedMessages[0].content).toBe("Hello world");
    }

    // Check assistant text message
    expect(displayedMessages[1].type).toBe("assistant");
    if (displayedMessages[1].type === "assistant") {
      expect(displayedMessages[1].content).toBe("I'll help you with that.");
      expect(displayedMessages[1].isStreaming).toBe(false);
    }

    // Check tool message
    expect(displayedMessages[2].type).toBe("tool");
    if (displayedMessages[2].type === "tool") {
      expect(displayedMessages[2].toolName).toBe("searchFiles");
      expect(displayedMessages[2].status).toBe("completed");
      expect(displayedMessages[2].args).toEqual({ pattern: "*.ts" });
      expect(displayedMessages[2].result).toEqual(["file1.ts", "file2.ts"]);
    }
  });

  it("should properly interleave text and tool calls temporally", () => {
    const aggregator = new StreamingMessageAggregator();

    // Start streaming
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "test-ws",
      messageId: "msg-interleaved",
      model: "claude-3",
    });

    // Stream first part of text
    aggregator.handleStreamDelta({
      type: "stream-delta",
      workspaceId: "test-ws",
      messageId: "msg-interleaved",
      delta: "Let me search for that. ",
    });

    // Tool call interrupts
    aggregator.handleToolCallStart({
      type: "tool-call-start",
      workspaceId: "test-ws",
      messageId: "msg-interleaved",
      toolCallId: "tool-search",
      toolName: "searchFiles",
      args: { query: "test" },
    });

    // More text after tool call
    aggregator.handleStreamDelta({
      type: "stream-delta",
      workspaceId: "test-ws",
      messageId: "msg-interleaved",
      delta: "I found the following results: ",
    });

    aggregator.handleStreamDelta({
      type: "stream-delta",
      workspaceId: "test-ws",
      messageId: "msg-interleaved",
      delta: "file1.ts and file2.ts",
    });

    // Tool call completes
    aggregator.handleToolCallEnd({
      type: "tool-call-end",
      workspaceId: "test-ws",
      messageId: "msg-interleaved",
      toolCallId: "tool-search",
      toolName: "searchFiles",
      result: ["file1.ts", "file2.ts"],
    });

    // Get the message and verify structure
    const messages = aggregator.getAllMessages();
    expect(messages).toHaveLength(1);

    const message = messages[0];
    // Should have 3 parts: text, tool, text
    expect(message.parts).toHaveLength(3);

    // First text part (before tool)
    expect(message.parts[0].type).toBe("text");
    if (message.parts[0].type === "text") {
      expect(message.parts[0].text).toBe("Let me search for that. ");
      expect(message.parts[0].state).toBe("done");
    }

    // Tool part in the middle
    expect(message.parts[1].type).toBe("dynamic-tool");
    const toolPart = message.parts[1] as DynamicToolPart;
    expect(toolPart.toolName).toBe("searchFiles");
    expect(toolPart.state).toBe("output-available");

    // Second text part (after tool)
    expect(message.parts[2].type).toBe("text");
    if (message.parts[2].type === "text") {
      expect(message.parts[2].text).toBe("I found the following results: file1.ts and file2.ts");
      expect(message.parts[2].state).toBe("streaming");
    }

    // Test DisplayedMessages split
    const displayedMessages = aggregator.getDisplayedMessages();
    // Should have 3 displayed messages: text, tool, text
    expect(displayedMessages).toHaveLength(3);

    expect(displayedMessages[0].type).toBe("assistant");
    if (displayedMessages[0].type === "assistant") {
      expect(displayedMessages[0].content).toBe("Let me search for that. ");
    }

    expect(displayedMessages[1].type).toBe("tool");
    if (displayedMessages[1].type === "tool") {
      expect(displayedMessages[1].toolName).toBe("searchFiles");
    }

    expect(displayedMessages[2].type).toBe("assistant");
    if (displayedMessages[2].type === "assistant") {
      expect(displayedMessages[2].content).toBe(
        "I found the following results: file1.ts and file2.ts"
      );
      expect(displayedMessages[2].isStreaming).toBe(true);
    }
  });

  it("should preserve temporal ordering after stream-end", () => {
    const aggregator = new StreamingMessageAggregator();

    // Start streaming
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "test-ws",
      messageId: "msg-end-test",
      model: "claude-3",
    });

    // Stream first text
    aggregator.handleStreamDelta({
      type: "stream-delta",
      workspaceId: "test-ws",
      messageId: "msg-end-test",
      delta: "First part. ",
    });

    // Tool interrupts
    aggregator.handleToolCallStart({
      type: "tool-call-start",
      workspaceId: "test-ws",
      messageId: "msg-end-test",
      toolCallId: "tool-1",
      toolName: "readFile",
      args: { file: "test.ts" },
    });

    // More text after tool
    aggregator.handleStreamDelta({
      type: "stream-delta",
      workspaceId: "test-ws",
      messageId: "msg-end-test",
      delta: "Second part after tool.",
    });

    // End stream with complete content - should preserve temporal ordering
    aggregator.handleStreamEnd({
      type: "stream-end",
      workspaceId: "test-ws",
      messageId: "msg-end-test",
      model: "claude-3",
      parts: [
        { type: "text", text: "First part. ", state: "done" },
        {
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "readFile",
          state: "output-available",
          input: { file: "test.ts" },
          output: "file contents",
        },
        { type: "text", text: "Second part after tool.", state: "done" },
      ],
    });

    // Verify temporal ordering is preserved
    const messages = aggregator.getAllMessages();
    expect(messages).toHaveLength(1);

    const message = messages[0];
    expect(message.parts).toHaveLength(3);

    // First text part
    expect(message.parts[0].type).toBe("text");
    if (message.parts[0].type === "text") {
      expect(message.parts[0].text).toBe("First part. ");
      expect(message.parts[0].state).toBe("done");
    }

    // Tool in the middle
    expect(message.parts[1].type).toBe("dynamic-tool");

    // Second text part - should be preserved, not merged
    expect(message.parts[2].type).toBe("text");
    if (message.parts[2].type === "text") {
      expect(message.parts[2].text).toBe("Second part after tool.");
      expect(message.parts[2].state).toBe("done");
    }

    // Verify DisplayedMessages also maintains order
    const displayed = aggregator.getDisplayedMessages();
    expect(displayed).toHaveLength(3);
    expect(displayed[0].type).toBe("assistant");
    expect(displayed[1].type).toBe("tool");
    expect(displayed[2].type).toBe("assistant");
  });

  it("should handle streaming to non-streaming transition smoothly", () => {
    const aggregator = new StreamingMessageAggregator();

    // Start streaming
    aggregator.handleStreamStart({
      type: "stream-start",
      workspaceId: "test-ws",
      messageId: "msg-2",
      model: "claude-3",
    });

    // Add some content
    aggregator.handleStreamDelta({
      type: "stream-delta",
      workspaceId: "test-ws",
      messageId: "msg-2",
      delta: "Hello, ",
    });

    aggregator.handleStreamDelta({
      type: "stream-delta",
      workspaceId: "test-ws",
      messageId: "msg-2",
      delta: "world!",
    });

    // End streaming
    aggregator.handleStreamEnd({
      type: "stream-end",
      workspaceId: "test-ws",
      messageId: "msg-2",
      model: "claude-3",
      parts: [{ type: "text", text: "Hello, world!", state: "done" }],
    });

    // Verify the message content
    const messages = aggregator.getAllMessages();
    expect(messages).toHaveLength(1);

    const firstPart = messages[0].parts[0];
    if (firstPart.type === "text") {
      expect(firstPart.text).toBe("Hello, world!");
      expect(firstPart.state).toBe("done");
    }
  });
});

import { describe, test, expect } from "bun:test";
import { splitToolCallsAndResults } from "./messageTransform";
import type { CmuxMessage } from "../types/message";

describe("splitToolCallsAndResults", () => {
  test("splits text after tool calls into separate message", () => {
    const messages: CmuxMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        parts: [
          { type: "text", text: "Before tool", state: "done" },
          {
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "readFile",
            state: "output-available",
            input: { path: "test.txt" },
            output: { content: "hello" },
          },
          { type: "text", text: "After tool", state: "done" },
        ],
      },
    ];

    const result = splitToolCallsAndResults(messages, "anthropic:claude-opus-4-1");

    expect(result).toHaveLength(2);
    expect(result[0].parts).toHaveLength(2); // text + tool
    expect(result[0].parts[0]).toEqual({ type: "text", text: "Before tool", state: "done" });
    expect(result[1].id).toBe("msg-1-continuation");
    expect(result[1].parts).toHaveLength(1);
    expect(result[1].parts[0]).toEqual({ type: "text", text: "After tool", state: "done" });
  });

  test("does not split when no text after tools", () => {
    const messages: CmuxMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        parts: [
          { type: "text", text: "Before tool", state: "done" },
          {
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "readFile",
            state: "output-available",
            input: { path: "test.txt" },
            output: { content: "hello" },
          },
        ],
      },
    ];

    const result = splitToolCallsAndResults(messages, "anthropic:claude-opus-4-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(messages[0]);
  });

  test("passes through user messages unchanged", () => {
    const messages: CmuxMessage[] = [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Hello", state: "done" }],
      },
    ];

    const result = splitToolCallsAndResults(messages, "anthropic:claude-opus-4-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(messages[0]);
  });

  test("handles multiple tools with text after last one", () => {
    const messages: CmuxMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "readFile",
            state: "output-available",
            input: { path: "a.txt" },
            output: { content: "a" },
          },
          {
            type: "dynamic-tool",
            toolCallId: "tool-2",
            toolName: "readFile",
            state: "output-available",
            input: { path: "b.txt" },
            output: { content: "b" },
          },
          { type: "text", text: "Summary", state: "done" },
        ],
      },
    ];

    const result = splitToolCallsAndResults(messages, "anthropic:claude-opus-4-1");

    expect(result).toHaveLength(2);
    expect(result[0].parts).toHaveLength(2); // both tools
    expect(result[1].parts).toHaveLength(1); // summary text
  });
});

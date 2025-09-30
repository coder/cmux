import { describe, it, expect } from "@jest/globals";
import type { ModelMessage, AssistantModelMessage, ToolModelMessage } from "ai";
import { transformModelMessages, validateAnthropicCompliance } from "./modelMessageTransform";

describe("modelMessageTransform", () => {
  describe("transformModelMessages", () => {
    it("should handle assistant messages with string content", () => {
      const assistantMsg: AssistantModelMessage = {
        role: "assistant",
        content: "Hi there!",
      };

      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        assistantMsg,
      ];

      const result = transformModelMessages(messages);
      expect(result).toEqual(messages);
    });

    it("should keep messages without mixed content unchanged", () => {
      const assistantMsg1: AssistantModelMessage = {
        role: "assistant",
        content: [{ type: "text", text: "Let me help you with that." }],
      };
      const assistantMsg2: AssistantModelMessage = {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "call1", toolName: "bash", input: { script: "ls" } },
        ],
      };
      const messages: ModelMessage[] = [assistantMsg1, assistantMsg2];

      const result = transformModelMessages(messages);
      expect(result).toEqual(messages);
    });

    it("should split assistant messages with mixed text and tool calls without results", () => {
      const assistantMsg: AssistantModelMessage = {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check that for you." },
          { type: "tool-call", toolCallId: "call1", toolName: "bash", input: { script: "ls" } },
        ],
      };
      const messages: ModelMessage[] = [assistantMsg];

      const result = transformModelMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("assistant");
      expect((result[0] as AssistantModelMessage).content).toEqual([
        { type: "text", text: "Let me check that for you." },
      ]);
      expect(result[1].role).toBe("assistant");
      expect((result[1] as AssistantModelMessage).content).toEqual([
        { type: "tool-call", toolCallId: "call1", toolName: "bash", input: { script: "ls" } },
      ]);
    });

    it("should handle mixed content with tool results properly", () => {
      const assistantMsg: AssistantModelMessage = {
        role: "assistant",
        content: [
          { type: "text", text: "First, let me check something." },
          { type: "tool-call", toolCallId: "call1", toolName: "bash", input: { script: "pwd" } },
          { type: "tool-call", toolCallId: "call2", toolName: "bash", input: { script: "ls" } },
          { type: "text", text: "Now let me check another thing." },
          {
            type: "tool-call",
            toolCallId: "call3",
            toolName: "read_file",
            input: { path: "test.txt" },
          },
        ],
      };
      const toolMsg: ToolModelMessage = {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call1",
            toolName: "bash",
            output: { type: "json", value: { stdout: "/home/user" } },
          },
          {
            type: "tool-result",
            toolCallId: "call2",
            toolName: "bash",
            output: { type: "json", value: { stdout: "file1 file2" } },
          },
          {
            type: "tool-result",
            toolCallId: "call3",
            toolName: "read_file",
            output: { type: "json", value: { content: "test content" } },
          },
        ],
      };
      const messages: ModelMessage[] = [assistantMsg, toolMsg];

      const result = transformModelMessages(messages);

      // Should split into multiple messages with tool results properly placed
      expect(result.length).toBeGreaterThan(2);

      // First should be text
      expect(result[0].role).toBe("assistant");
      expect((result[0] as AssistantModelMessage).content).toEqual([
        { type: "text", text: "First, let me check something." },
      ]);

      // Then tool calls with their results
      expect(result[1].role).toBe("assistant");
      const secondContent = (result[1] as AssistantModelMessage).content;
      expect(Array.isArray(secondContent)).toBe(true);
      if (Array.isArray(secondContent)) {
        expect(secondContent.some((c) => c.type === "tool-call")).toBe(true);
      }

      // Tool results should follow tool calls
      expect(result[2].role).toBe("tool");
    });
  });

  describe("validateAnthropicCompliance", () => {
    it("should validate correct message sequences", () => {
      const assistantMsg1: AssistantModelMessage = {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call1", toolName: "bash", input: {} }],
      };
      const toolMsg: ToolModelMessage = {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call1",
            toolName: "bash",
            output: { type: "json", value: {} },
          },
        ],
      };
      const assistantMsg2: AssistantModelMessage = {
        role: "assistant",
        content: [{ type: "text", text: "Done!" }],
      };
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        assistantMsg1,
        toolMsg,
        assistantMsg2,
      ];

      const result = validateAnthropicCompliance(messages);
      expect(result.valid).toBe(true);
    });

    it("should detect tool calls without results", () => {
      const assistantMsg1: AssistantModelMessage = {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call1", toolName: "bash", input: {} }],
      };
      const assistantMsg2: AssistantModelMessage = {
        role: "assistant",
        content: [{ type: "text", text: "Something else" }],
      };
      const messages: ModelMessage[] = [assistantMsg1, assistantMsg2];

      const result = validateAnthropicCompliance(messages);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("tool_use blocks found without tool_result");
    });

    it("should detect mismatched tool results", () => {
      const assistantMsg: AssistantModelMessage = {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call1", toolName: "bash", input: {} }],
      };
      const toolMsg: ToolModelMessage = {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call2",
            toolName: "bash",
            output: { type: "json", value: {} },
          },
        ],
      };
      const messages: ModelMessage[] = [assistantMsg, toolMsg];

      const result = validateAnthropicCompliance(messages);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("no corresponding tool_use");
    });

    it("should handle string content in assistant messages", () => {
      const assistantMsg: AssistantModelMessage = {
        role: "assistant",
        content: "Just a string message",
      };
      const messages: ModelMessage[] = [
        assistantMsg,
        {
          role: "user",
          content: [{ type: "text", text: "Reply" }],
        },
      ];

      const result = validateAnthropicCompliance(messages);
      expect(result.valid).toBe(true);
    });
  });
});

import { describe, it, expect } from "@jest/globals";
import type { ModelMessage, AssistantModelMessage, ToolModelMessage } from "ai";
import {
  transformModelMessages,
  validateAnthropicCompliance,
} from "./modelMessageTransform";
import type { CmuxMessage } from "@/types/message";

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

      const result = transformModelMessages(messages, "anthropic");
      expect(result).toEqual(messages);
    });

    it("should keep text-only messages unchanged", () => {
      const assistantMsg1: AssistantModelMessage = {
        role: "assistant",
        content: [{ type: "text", text: "Let me help you with that." }],
      };
      const assistantMsg2: AssistantModelMessage = {
        role: "assistant",
        content: [{ type: "text", text: "Here's the result." }],
      };
      const messages: ModelMessage[] = [assistantMsg1, assistantMsg2];

      const result = transformModelMessages(messages, "anthropic");
      expect(result).toEqual(messages);
    });

    it("should strip tool calls without results (interrupted mixed content)", () => {
      const assistantMsg: AssistantModelMessage = {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check that for you." },
          { type: "tool-call", toolCallId: "call1", toolName: "bash", input: { script: "ls" } },
        ],
      };
      const messages: ModelMessage[] = [assistantMsg];

      const result = transformModelMessages(messages, "anthropic");

      // Should only keep text, strip interrupted tool calls
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("assistant");
      expect((result[0] as AssistantModelMessage).content).toEqual([
        { type: "text", text: "Let me check that for you." },
      ]);
    });

    it("should strip tool-only messages without results (orphaned tool calls)", () => {
      const assistantMsg: AssistantModelMessage = {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "call1", toolName: "bash", input: { script: "ls" } },
        ],
      };
      const messages: ModelMessage[] = [assistantMsg];

      const result = transformModelMessages(messages, "anthropic");

      // Should filter out the entire message since it only has orphaned tool calls
      expect(result).toHaveLength(0);
    });

    it("should handle partial results (some tool calls interrupted)", () => {
      // Assistant makes 3 tool calls, but only 2 have results (3rd was interrupted)
      const assistantMsg: AssistantModelMessage = {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check a few things." },
          { type: "tool-call", toolCallId: "call1", toolName: "bash", input: { script: "pwd" } },
          { type: "tool-call", toolCallId: "call2", toolName: "bash", input: { script: "ls" } },
          { type: "tool-call", toolCallId: "call3", toolName: "bash", input: { script: "date" } },
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
          // call3 has no result (interrupted)
        ],
      };
      const messages: ModelMessage[] = [assistantMsg, toolMsg];

      const result = transformModelMessages(messages, "anthropic");

      // Should have: text message, tool calls (only call1 & call2), tool results
      expect(result).toHaveLength(3);

      // First: text
      expect(result[0].role).toBe("assistant");
      expect((result[0] as AssistantModelMessage).content).toEqual([
        { type: "text", text: "Let me check a few things." },
      ]);

      // Second: only tool calls with results (call1, call2), NOT call3
      expect(result[1].role).toBe("assistant");
      const toolCallContent = (result[1] as AssistantModelMessage).content;
      expect(Array.isArray(toolCallContent)).toBe(true);
      if (Array.isArray(toolCallContent)) {
        expect(toolCallContent).toHaveLength(2);
        expect(toolCallContent[0]).toEqual({
          type: "tool-call",
          toolCallId: "call1",
          toolName: "bash",
          input: { script: "pwd" },
        });
        expect(toolCallContent[1]).toEqual({
          type: "tool-call",
          toolCallId: "call2",
          toolName: "bash",
          input: { script: "ls" },
        });
      }

      // Third: tool results (only for call1 & call2)
      expect(result[2].role).toBe("tool");
      const toolResultContent = (result[2] as ToolModelMessage).content;
      expect(toolResultContent).toHaveLength(2);
      expect(toolResultContent[0]).toEqual({
        type: "tool-result",
        toolCallId: "call1",
        toolName: "bash",
        output: { type: "json", value: { stdout: "/home/user" } },
      });
      expect(toolResultContent[1]).toEqual({
        type: "tool-result",
        toolCallId: "call2",
        toolName: "bash",
        output: { type: "json", value: { stdout: "file1 file2" } },
      });
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
            toolName: "file_read",
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
            toolName: "file_read",
            output: { type: "json", value: { content: "test content" } },
          },
        ],
      };
      const messages: ModelMessage[] = [assistantMsg, toolMsg];

      const result = transformModelMessages(messages, "anthropic");

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

  describe("consecutive user messages", () => {
    it("should keep single user message unchanged", () => {
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ];

      const result = transformModelMessages(messages, "anthropic");
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("user");
      expect((result[0].content as Array<{ type: string; text: string }>)[0].text).toBe("Hello");
    });

    it("should merge two consecutive user messages with newline", () => {
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "World" }],
        },
      ];

      const result = transformModelMessages(messages, "anthropic");
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("user");
      expect((result[0].content as Array<{ type: string; text: string }>)[0].text).toBe(
        "Hello\nWorld"
      );
    });

    it("should merge three consecutive user messages with newlines", () => {
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "First" }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "Second" }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "Third" }],
        },
      ];

      const result = transformModelMessages(messages, "anthropic");
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("user");
      expect((result[0].content as Array<{ type: string; text: string }>)[0].text).toBe(
        "First\nSecond\nThird"
      );
    });

    it("should not merge user messages separated by assistant message", () => {
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "Hi there!" }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "How are you?" }],
        },
      ];

      const result = transformModelMessages(messages, "anthropic");
      expect(result).toHaveLength(3);
      expect(result[0].role).toBe("user");
      expect((result[0].content as Array<{ type: string; text: string }>)[0].text).toBe("Hello");
      expect(result[1].role).toBe("assistant");
      expect(result[2].role).toBe("user");
      expect((result[2].content as Array<{ type: string; text: string }>)[0].text).toBe(
        "How are you?"
      );
    });
  });



  describe("reasoning part stripping for OpenAI", () => {
    it("should strip reasoning parts for OpenAI provider", () => {
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Solve this problem" }],
        },
        {
          role: "assistant",
          content: [
            { type: "reasoning", text: "Let me think about this..." },
            { type: "text", text: "Here's the solution" },
          ],
        },
      ];

      const result = transformModelMessages(messages, "openai");

      // Should have 2 messages, assistant message should only have text
      expect(result).toHaveLength(2);
      expect(result[1].role).toBe("assistant");
      expect((result[1] as AssistantModelMessage).content).toEqual([
        { type: "text", text: "Here's the solution" },
      ]);
    });

    it("should preserve reasoning parts for Anthropic provider", () => {
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Solve this problem" }],
        },
        {
          role: "assistant",
          content: [
            { type: "reasoning", text: "Let me think about this..." },
            { type: "text", text: "Here's the solution" },
          ],
        },
      ];

      const result = transformModelMessages(messages, "anthropic");

      // Should have 2 messages, assistant message should have both reasoning and text
      expect(result).toHaveLength(2);
      expect(result[1].role).toBe("assistant");
      const content = (result[1] as AssistantModelMessage).content;
      expect(Array.isArray(content)).toBe(true);
      if (Array.isArray(content)) {
        expect(content).toHaveLength(2);
        expect(content[0]).toEqual({ type: "reasoning", text: "Let me think about this..." });
        expect(content[1]).toEqual({ type: "text", text: "Here's the solution" });
      }
    });

    it("should filter out reasoning-only messages for OpenAI", () => {
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Calculate something" }],
        },
        {
          role: "assistant",
          content: [{ type: "reasoning", text: "Let me think..." }],
        },
      ];

      const result = transformModelMessages(messages, "openai");

      // Should only have user message, reasoning-only assistant message should be filtered out
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("user");
    });

    it("should preserve tool calls when stripping reasoning for OpenAI", () => {
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Run a command" }],
        },
        {
          role: "assistant",
          content: [
            { type: "reasoning", text: "I need to check something..." },
            { type: "text", text: "Let me check" },
            { type: "tool-call", toolCallId: "call1", toolName: "bash", input: { script: "pwd" } },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call1",
              toolName: "bash",
              output: { type: "json", value: { stdout: "/home/user" } },
            },
          ],
        },
      ];

      const result = transformModelMessages(messages, "openai");

      // Should have user, text, tool-call, tool-result (no reasoning)
      expect(result.length).toBeGreaterThan(2);

      // Find the assistant message with text
      const textMessage = result.find((msg) => {
        if (msg.role !== "assistant") return false;
        const content = msg.content;
        return Array.isArray(content) && content.some((c) => c.type === "text");
      });
      expect(textMessage).toBeDefined();
      if (textMessage) {
        const content = (textMessage as AssistantModelMessage).content;
        if (Array.isArray(content)) {
          // Should not have reasoning parts
          expect(content.some((c) => c.type === "reasoning")).toBe(false);
          // Should have text
          expect(content.some((c) => c.type === "text")).toBe(true);
        }
      }

      // Find the assistant message with tool-call
      const toolCallMessage = result.find((msg) => {
        if (msg.role !== "assistant") return false;
        const content = msg.content;
        return Array.isArray(content) && content.some((c) => c.type === "tool-call");
      });
      expect(toolCallMessage).toBeDefined();
    });

    it("should handle multiple reasoning parts for OpenAI", () => {
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Complex task" }],
        },
        {
          role: "assistant",
          content: [
            { type: "reasoning", text: "First, I'll consider..." },
            { type: "reasoning", text: "Then, I'll analyze..." },
            { type: "text", text: "Final answer" },
          ],
        },
      ];

      const result = transformModelMessages(messages, "openai");

      // Should have 2 messages, assistant should only have text
      expect(result).toHaveLength(2);
      expect(result[1].role).toBe("assistant");
      expect((result[1] as AssistantModelMessage).content).toEqual([
        { type: "text", text: "Final answer" },
      ]);
    });
  });
});

import { describe, it, expect } from "bun:test";
import { createStatusSetTool } from "./status_set";
import type { ToolConfiguration } from "@/utils/tools/tools";
import { createRuntime } from "@/runtime/runtimeFactory";
import type { ToolCallOptions } from "ai";

describe("status_set tool validation", () => {
  const mockConfig: ToolConfiguration = {
    cwd: "/test",
    runtime: createRuntime({ type: "local", srcBaseDir: "/tmp" }),
    runtimeTempDir: "/tmp",
  };

  const mockToolCallOptions: ToolCallOptions = {
    toolCallId: "test-call-id",
    messages: [],
  };

  describe("emoji validation", () => {
    it("should accept single emoji characters", async () => {
      const tool = createStatusSetTool(mockConfig);

      const emojis = ["🔍", "📝", "✅", "🚀", "⏳"];
      for (const emoji of emojis) {
        const result = await tool.execute!({ emoji, message: "Test" }, mockToolCallOptions);
        expect(result).toEqual({ success: true, emoji, message: "Test" });
      }
    });

    it("should reject multiple emojis", async () => {
      const tool = createStatusSetTool(mockConfig);

      const result1 = await tool.execute!({ emoji: "🔍📝", message: "Test" }, mockToolCallOptions);
      expect(result1).toEqual({ success: false, error: "emoji must be a single emoji character" });

      const result2 = await tool.execute!({ emoji: "✅✅", message: "Test" }, mockToolCallOptions);
      expect(result2).toEqual({ success: false, error: "emoji must be a single emoji character" });
    });

    it("should reject text (non-emoji)", async () => {
      const tool = createStatusSetTool(mockConfig);

      const result1 = await tool.execute!({ emoji: "a", message: "Test" }, mockToolCallOptions);
      expect(result1).toEqual({ success: false, error: "emoji must be a single emoji character" });

      const result2 = await tool.execute!({ emoji: "abc", message: "Test" }, mockToolCallOptions);
      expect(result2).toEqual({ success: false, error: "emoji must be a single emoji character" });

      const result3 = await tool.execute!({ emoji: "!", message: "Test" }, mockToolCallOptions);
      expect(result3).toEqual({ success: false, error: "emoji must be a single emoji character" });
    });

    it("should reject empty emoji", async () => {
      const tool = createStatusSetTool(mockConfig);

      const result = await tool.execute!({ emoji: "", message: "Test" }, mockToolCallOptions);
      expect(result).toEqual({ success: false, error: "emoji must be a single emoji character" });
    });

    it("should reject emoji with text", async () => {
      const tool = createStatusSetTool(mockConfig);

      const result1 = await tool.execute!({ emoji: "🔍a", message: "Test" }, mockToolCallOptions);
      expect(result1).toEqual({ success: false, error: "emoji must be a single emoji character" });

      const result2 = await tool.execute!({ emoji: "x🔍", message: "Test" }, mockToolCallOptions);
      expect(result2).toEqual({ success: false, error: "emoji must be a single emoji character" });
    });
  });

  describe("message validation", () => {
    it("should accept messages up to 40 characters", async () => {
      const tool = createStatusSetTool(mockConfig);

      const result1 = await tool.execute!(
        { emoji: "✅", message: "a".repeat(40) },
        mockToolCallOptions
      );
      expect(result1.success).toBe(true);

      const result2 = await tool.execute!(
        { emoji: "✅", message: "Analyzing code structure" },
        mockToolCallOptions
      );
      expect(result2.success).toBe(true);
    });

    it("should accept empty message", async () => {
      const tool = createStatusSetTool(mockConfig);

      const result = await tool.execute!({ emoji: "✅", message: "" }, mockToolCallOptions);
      expect(result.success).toBe(true);
    });
  });
});


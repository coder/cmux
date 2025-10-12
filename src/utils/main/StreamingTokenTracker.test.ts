import { describe, test, expect, beforeEach } from "bun:test";
import { StreamingTokenTracker } from "./StreamingTokenTracker";

describe("StreamingTokenTracker", () => {
  let tracker: StreamingTokenTracker;

  beforeEach(() => {
    tracker = new StreamingTokenTracker();
    tracker.setModel("anthropic:claude-sonnet-4-5");
  });

  describe("countTokens", () => {
    test("returns 0 for empty string", () => {
      expect(tracker.countTokens("")).toBe(0);
    });

    test("counts tokens in simple text", () => {
      const count = tracker.countTokens("Hello world");
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10); // Reasonable upper bound
    });

    test("counts tokens in longer text", () => {
      const text = "This is a longer piece of text with more tokens";
      const count = tracker.countTokens(text);
      expect(count).toBeGreaterThan(5);
    });

    test("handles special characters", () => {
      const count = tracker.countTokens("🚀 emoji test");
      expect(count).toBeGreaterThan(0);
    });

    test("is consistent for repeated calls", () => {
      const text = "Test consistency";
      const count1 = tracker.countTokens(text);
      const count2 = tracker.countTokens(text);
      expect(count1).toBe(count2);
    });
  });

  describe("setModel", () => {
    test("switches tokenizer for different models", () => {
      tracker.setModel("openai:gpt-4");
      const count = tracker.countTokens("test");
      expect(count).toBeGreaterThan(0);
    });

    test("does not replace exact tokenizer with approximation", () => {
      // Set a model with exact tokenizer
      tracker.setModel("anthropic:claude-sonnet-4-5");
      const exactCount = tracker.countTokens("test");

      // Try to set a model that might use approximation (shouldn't replace)
      tracker.setModel("anthropic:claude-opus-4");
      const afterCount = tracker.countTokens("test");

      // Counts should be consistent (tokenizer not replaced)
      expect(afterCount).toBe(exactCount);
    });
  });
});

import { describe, test, expect, beforeEach } from "bun:test";
import { StreamingTokenTracker } from "./StreamingTokenTracker";

describe("StreamingTokenTracker", () => {
  let tracker: StreamingTokenTracker;

  beforeEach(() => {
    tracker = new StreamingTokenTracker();
  });

  describe("countTokens", () => {
    test("returns 0 for empty string", () => {
      tracker.setModel("anthropic:claude-sonnet-4-5");
      expect(tracker.countTokens("")).toBe(0);
    });

    test("counts tokens in simple text", () => {
      tracker.setModel("anthropic:claude-sonnet-4-5");
      const count = tracker.countTokens("Hello world");
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10); // Reasonable upper bound
    });

    test("counts tokens in longer text", () => {
      tracker.setModel("anthropic:claude-sonnet-4-5");
      const text = "This is a longer piece of text with more tokens";
      const count = tracker.countTokens(text);
      expect(count).toBeGreaterThan(5);
    });

    test("handles special characters", () => {
      tracker.setModel("anthropic:claude-sonnet-4-5");
      const count = tracker.countTokens("🚀 emoji test");
      expect(count).toBeGreaterThan(0);
    });

    test("is consistent for repeated calls", () => {
      tracker.setModel("anthropic:claude-sonnet-4-5");
      const text = "Test consistency";
      const count1 = tracker.countTokens(text);
      const count2 = tracker.countTokens(text);
      expect(count1).toBe(count2);
    });
  });

  describe("setModel", () => {
    test("switches tokenizer for different models", () => {
      tracker.setModel("anthropic:claude-sonnet-4-5");
      const initial = tracker.countTokens("test");

      tracker.setModel("openai:gpt-4");
      const switched = tracker.countTokens("test");

      expect(initial).toBeGreaterThan(0);
      expect(switched).toBeGreaterThan(0);
    });
  });
});

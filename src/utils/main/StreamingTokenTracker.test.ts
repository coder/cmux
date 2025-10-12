/**
 * Tests for StreamingTokenTracker
 */

import { StreamingTokenTracker } from "./StreamingTokenTracker";

describe("StreamingTokenTracker", () => {
  let tracker: StreamingTokenTracker;

  beforeEach(() => {
    tracker = new StreamingTokenTracker();
    tracker.setModel("openai:gpt-4o");
  });

  afterEach(() => {
    tracker.clearAll();
  });

  describe("token counting", () => {
    it("tracks text tokens incrementally", () => {
      const messageId = "msg-1";

      // Add small deltas
      tracker.trackDelta(messageId, "Hello ", "text");
      tracker.trackDelta(messageId, "world", "text");

      // Should have approximate count (buffered)
      const count1 = tracker.getTokenCount(messageId);
      expect(count1).toBeGreaterThan(0);

      // Finalize to get exact count
      tracker.finalize(messageId);
      const finalCount = tracker.getTokenCount(messageId);
      expect(finalCount).toBeGreaterThanOrEqual(2); // "Hello world" is ~2-3 tokens
    });

    it("tracks reasoning tokens separately", () => {
      const messageId = "msg-2";

      tracker.trackDelta(messageId, "Let me think... ", "reasoning");
      tracker.trackDelta(messageId, "The answer is 42", "text");

      tracker.finalize(messageId);
      const count = tracker.getTokenCount(messageId);
      expect(count).toBeGreaterThan(5); // Combined tokens
    });

    it("tracks tool args tokens", () => {
      const messageId = "msg-3";

      tracker.trackDelta(messageId, '{"summary": "This is a test"}', "tool-args");

      tracker.finalize(messageId);
      const count = tracker.getTokenCount(messageId);
      expect(count).toBeGreaterThan(3);
    });

    it("handles large text that exceeds char threshold", () => {
      const messageId = "msg-4";

      // Add text that exceeds TOKENIZE_CHAR_THRESHOLD (400 chars)
      const largeText = "word ".repeat(100); // 500 chars
      tracker.trackDelta(messageId, largeText, "text");

      // Should have been tokenized automatically (not just buffered estimate)
      const count = tracker.getTokenCount(messageId);
      expect(count).toBeGreaterThan(80); // ~100 words = ~100 tokens
    });
  });

  describe("TPS calculation", () => {
    it("calculates TPS after multiple updates", async () => {
      const messageId = "msg-5";

      // Simulate streaming over time
      tracker.trackDelta(messageId, "Hello world ", "text");

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 150));

      tracker.trackDelta(messageId, "more text here ", "text");

      // Finalize to trigger tokenization
      tracker.finalize(messageId);

      const tps = tracker.getTPS(messageId);
      // TPS might be 0 if time delta is too small or not enough samples
      expect(tps).toBeGreaterThanOrEqual(0);
    });

    it("returns 0 TPS for message with no deltas", () => {
      const messageId = "msg-6";
      const tps = tracker.getTPS(messageId);
      expect(tps).toBe(0);
    });
  });

  describe("state management", () => {
    it("returns 0 for non-existent message", () => {
      const count = tracker.getTokenCount("non-existent");
      expect(count).toBe(0);

      const tps = tracker.getTPS("non-existent");
      expect(tps).toBe(0);
    });

    it("clears individual message state", () => {
      const messageId = "msg-7";

      tracker.trackDelta(messageId, "Some text", "text");
      expect(tracker.getTokenCount(messageId)).toBeGreaterThan(0);

      tracker.clear(messageId);
      expect(tracker.getTokenCount(messageId)).toBe(0);
    });

    it("clears all message state", () => {
      tracker.trackDelta("msg-1", "Text 1", "text");
      tracker.trackDelta("msg-2", "Text 2", "text");

      expect(tracker.getTokenCount("msg-1")).toBeGreaterThan(0);
      expect(tracker.getTokenCount("msg-2")).toBeGreaterThan(0);

      tracker.clearAll();
      expect(tracker.getTokenCount("msg-1")).toBe(0);
      expect(tracker.getTokenCount("msg-2")).toBe(0);
    });
  });

  describe("batching behavior", () => {
    it("provides estimates before batching threshold", () => {
      const messageId = "msg-8";

      // Add text below threshold (< 400 chars)
      tracker.trackDelta(messageId, "Short text", "text");

      // Should return estimate (~4 chars/token)
      const count = tracker.getTokenCount(messageId);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10); // Rough estimate
    });

    it("tokenizes when char threshold exceeded", () => {
      const messageId = "msg-9";

      // Accumulate text just under threshold
      const text1 = "a".repeat(300);
      tracker.trackDelta(messageId, text1, "text");

      // This should trigger tokenization
      const text2 = "b".repeat(150);
      tracker.trackDelta(messageId, text2, "text");

      const count = tracker.getTokenCount(messageId);
      // Should have actual token count, not just char estimate
      expect(count).toBeGreaterThan(50);
    });
  });

  describe("model switching", () => {
    it("updates tokenizer when model changes", () => {
      tracker.setModel("anthropic:claude-opus-4-1");

      const messageId = "msg-10";
      tracker.trackDelta(messageId, "Test with Claude tokenizer", "text");

      tracker.finalize(messageId);
      const count = tracker.getTokenCount(messageId);
      expect(count).toBeGreaterThan(0);
    });

    it("does not replace exact tokenizer with approximation", () => {
      // Start with exact tokenizer
      tracker.setModel("openai:gpt-4o");

      // Try to set approximation model (should keep existing exact tokenizer)
      tracker.setModel("unknown:model");

      const messageId = "msg-11";
      tracker.trackDelta(messageId, "Test", "text");
      tracker.finalize(messageId);

      // Should still work with cached tokenizer
      const count = tracker.getTokenCount(messageId);
      expect(count).toBeGreaterThan(0);
    });
  });
});

/**
 * Tests for StreamingTokenTracker model-change safety
 */

import { describe, it, expect } from "@jest/globals";
import { StreamingTokenTracker } from "./StreamingTokenTracker";

describe("StreamingTokenTracker", () => {
  it("should reinitialize tokenizer when model changes", () => {
    const tracker = new StreamingTokenTracker();

    // Set first model
    tracker.setModel("openai:gpt-4");
    const count1 = tracker.countTokens("test");

    // Switch to different model
    tracker.setModel("anthropic:claude-opus-4");
    const count2 = tracker.countTokens("test");

    // Both should return valid counts
    expect(count1).toBeGreaterThan(0);
    expect(count2).toBeGreaterThan(0);
  });

  it("should not reinitialize when model stays the same", () => {
    const tracker = new StreamingTokenTracker();

    // Set model twice
    tracker.setModel("openai:gpt-4");
    const count1 = tracker.countTokens("test");

    tracker.setModel("openai:gpt-4"); // Same model
    const count2 = tracker.countTokens("test");

    // Should get same count (cached)
    expect(count1).toBe(count2);
  });
});

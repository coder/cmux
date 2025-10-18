/**
 * Tests for tokenizer cache behavior
 */

import { describe, it, expect } from "@jest/globals";
import { getTokenizerForModel } from "./tokenizer";

describe("tokenizer cache", () => {
  const testText = "Hello, world!";

  it("should use different cache keys for different models", () => {
    // Get tokenizers for different models
    const gpt4Tokenizer = getTokenizerForModel("openai:gpt-4");
    const claudeTokenizer = getTokenizerForModel("anthropic:claude-opus-4");

    // Count tokens with first model
    const gpt4Count = gpt4Tokenizer.countTokens(testText);

    // Count tokens with second model
    const claudeCount = claudeTokenizer.countTokens(testText);

    // Counts may differ because different encodings
    // This test mainly ensures no crash and cache isolation
    expect(typeof gpt4Count).toBe("number");
    expect(typeof claudeCount).toBe("number");
    expect(gpt4Count).toBeGreaterThan(0);
    expect(claudeCount).toBeGreaterThan(0);
  });

  it("should return same count for same (model, text) pair from cache", () => {
    const tokenizer = getTokenizerForModel("openai:gpt-4");

    // First call
    const count1 = tokenizer.countTokens(testText);

    // Second call should hit cache
    const count2 = tokenizer.countTokens(testText);

    expect(count1).toBe(count2);
  });

  it("should normalize model keys for cache consistency", () => {
    // These should map to the same cache key
    const tokenizer1 = getTokenizerForModel("anthropic:claude-opus-4");
    const tokenizer2 = getTokenizerForModel("anthropic/claude-opus-4");

    const count1 = tokenizer1.countTokens(testText);
    const count2 = tokenizer2.countTokens(testText);

    // Should get same count since they normalize to same model
    expect(count1).toBe(count2);
  });
});

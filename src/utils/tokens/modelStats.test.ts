import { describe, expect, test } from "bun:test";
import { getModelStats } from "./modelStats";

describe("getModelStats", () => {
  test("should retrieve stats for anthropic:claude-opus-4-1", () => {
    const stats = getModelStats("anthropic:claude-opus-4-1");

    expect(stats).not.toBeNull();
    expect(stats).toEqual({
      max_input_tokens: 200000,
      input_cost_per_token: 0.000015,
      output_cost_per_token: 0.000075,
      cache_creation_input_token_cost: 0.00001875,
      cache_read_input_token_cost: 0.0000015,
    });
  });

  test("should work with model name without provider prefix", () => {
    const stats = getModelStats("claude-opus-4-1");

    expect(stats).not.toBeNull();
    expect(stats).toEqual({
      max_input_tokens: 200000,
      input_cost_per_token: 0.000015,
      output_cost_per_token: 0.000075,
      cache_creation_input_token_cost: 0.00001875,
      cache_read_input_token_cost: 0.0000015,
    });
  });

  test("should return null for non-existent model", () => {
    const stats = getModelStats("anthropic:non-existent-model");
    expect(stats).toBeNull();
  });

  test("should return null for model with missing required fields", () => {
    // Image generation models don't have input_cost_per_token
    const stats = getModelStats("dall-e-2");
    expect(stats).toBeNull();
  });

  test("should retrieve stats for gpt-5 with partial cache support", () => {
    // OpenAI models have cache_read costs but not cache_creation costs
    const stats = getModelStats("openai:gpt-5");
    expect(stats).not.toBeNull();
    expect(stats).toMatchObject({
      max_input_tokens: 272000,
      input_cost_per_token: 0.00000125,
      output_cost_per_token: 0.00001,
      cache_read_input_token_cost: 1.25e-7,
    });
    expect(stats?.cache_creation_input_token_cost).toBeUndefined();
  });
});

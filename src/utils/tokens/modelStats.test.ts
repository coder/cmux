import { getModelStats } from "./modelStats";

describe("getModelStats", () => {
  it("should return model stats for claude-sonnet-4-5", () => {
    const stats = getModelStats("anthropic:claude-sonnet-4-5");

    expect(stats).not.toBeNull();
    expect(stats?.input_cost_per_token).toBe(0.000003);
    expect(stats?.output_cost_per_token).toBe(0.000015);
    expect(stats?.max_input_tokens).toBe(200000);
  });

  it("should handle model without provider prefix", () => {
    const stats = getModelStats("claude-sonnet-4-5");

    expect(stats).not.toBeNull();
    expect(stats?.input_cost_per_token).toBe(0.000003);
  });

  it("should return cache pricing when available", () => {
    const stats = getModelStats("anthropic:claude-sonnet-4-5");

    expect(stats?.cache_creation_input_token_cost).toBe(0.00000375);
    expect(stats?.cache_read_input_token_cost).toBe(3e-7);
  });

  it("should return null for unknown models", () => {
    const stats = getModelStats("unknown:model");

    expect(stats).toBeNull();
  });
});

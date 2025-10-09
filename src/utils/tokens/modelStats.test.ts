import { getModelStats } from "./modelStats";

describe("getModelStats - 1M context pricing", () => {
  it("should return elevated pricing fields for claude-sonnet-4-5", () => {
    const stats = getModelStats("anthropic:claude-sonnet-4-5");
    
    expect(stats).not.toBeNull();
    expect(stats?.input_cost_per_token).toBe(0.000003);
    expect(stats?.output_cost_per_token).toBe(0.000015);
    expect(stats?.input_cost_per_token_above_200k_tokens).toBe(0.000006);
    expect(stats?.output_cost_per_token_above_200k_tokens).toBe(0.0000225);
  });

  it("should handle model without provider prefix", () => {
    const stats = getModelStats("claude-sonnet-4-5");
    
    expect(stats).not.toBeNull();
    expect(stats?.input_cost_per_token_above_200k_tokens).toBe(0.000006);
  });

  it("should return undefined elevated pricing for models without it", () => {
    const stats = getModelStats("openai:gpt-4");
    
    // OpenAI models don't have elevated pricing yet
    expect(stats?.input_cost_per_token_above_200k_tokens).toBeUndefined();
    expect(stats?.output_cost_per_token_above_200k_tokens).toBeUndefined();
  });
});

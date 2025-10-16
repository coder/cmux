import { describe, test, expect } from "@jest/globals";
import { createDisplayUsage } from "./tokenStatsCalculator";
import type { LanguageModelV2Usage } from "@ai-sdk/provider";

describe("createDisplayUsage", () => {
  test("uses usage.reasoningTokens when available", () => {
    const usage: LanguageModelV2Usage = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      reasoningTokens: 100,
    };

    const result = createDisplayUsage(usage, "openai:gpt-5-pro");

    expect(result?.reasoning.tokens).toBe(100);
    expect(result?.output.tokens).toBe(400); // 500 - 100
  });

  test("falls back to providerMetadata.openai.reasoningTokens when usage.reasoningTokens is undefined", () => {
    const usage: LanguageModelV2Usage = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      // reasoningTokens not provided
    };

    const providerMetadata = {
      openai: {
        reasoningTokens: 150,
        responseId: "resp_123",
        serviceTier: "default",
      },
    };

    const result = createDisplayUsage(usage, "openai:gpt-5-pro", providerMetadata);

    expect(result?.reasoning.tokens).toBe(150);
    expect(result?.output.tokens).toBe(350); // 500 - 150
  });

  test("uses 0 when both usage.reasoningTokens and providerMetadata.openai.reasoningTokens are undefined", () => {
    const usage: LanguageModelV2Usage = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
    };

    const providerMetadata = {
      openai: {
        responseId: "resp_123",
        serviceTier: "default",
      },
    };

    const result = createDisplayUsage(usage, "openai:gpt-5-pro", providerMetadata);

    expect(result?.reasoning.tokens).toBe(0);
    expect(result?.output.tokens).toBe(500); // All output tokens
  });

  test("prefers usage.reasoningTokens over providerMetadata when both exist", () => {
    const usage: LanguageModelV2Usage = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      reasoningTokens: 100,
    };

    const providerMetadata = {
      openai: {
        reasoningTokens: 999, // Should be ignored
        responseId: "resp_123",
        serviceTier: "default",
      },
    };

    const result = createDisplayUsage(usage, "openai:gpt-5-pro", providerMetadata);

    expect(result?.reasoning.tokens).toBe(100); // Uses usage, not providerMetadata
    expect(result?.output.tokens).toBe(400); // 500 - 100
  });

  test("works with non-OpenAI providers that don't have providerMetadata.openai", () => {
    const usage: LanguageModelV2Usage = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      reasoningTokens: 200,
    };

    const providerMetadata = {
      anthropic: {
        cacheCreationInputTokens: 50,
      },
    };

    const result = createDisplayUsage(
      usage,
      "anthropic:claude-sonnet-4-20250514",
      providerMetadata
    );

    expect(result?.reasoning.tokens).toBe(200);
    expect(result?.output.tokens).toBe(300); // 500 - 200
    expect(result?.cacheCreate.tokens).toBe(50); // Anthropic metadata still works
  });
});

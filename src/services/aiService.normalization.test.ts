import { describe, test, expect } from "bun:test";
import type { ProviderConfig } from "@/config";
import { normalizeProviderConfigForAISDK } from "./aiService";

describe("normalizeProviderConfigForAISDK", () => {
  test("maps baseUrl to baseURL without mutating the original", () => {
    const providerConfig = { baseUrl: " https://example.com/v1 " } satisfies ProviderConfig;

    const normalized = normalizeProviderConfigForAISDK(providerConfig);

    expect(normalized.baseURL).toBe("https://example.com/v1");
    expect("baseUrl" in normalized).toBe(false);
    // Original object should remain untouched (for config persistence/UI rendering)
    expect(providerConfig.baseUrl).toBe(" https://example.com/v1 ");
  });

  test("keeps existing baseURL when both baseURL and baseUrl are provided", () => {
    const providerConfig = {
      baseURL: "https://already-set.example.com",
      baseUrl: "https://should-be-ignored.example.com",
    } satisfies ProviderConfig;

    const normalized = normalizeProviderConfigForAISDK(providerConfig);

    expect(normalized.baseURL).toBe("https://already-set.example.com");
    expect("baseUrl" in normalized).toBe(false);
  });

  test("uses apiToken when apiKey is missing or blank", () => {
    const providerConfig = {
      apiKey: "   ",
      apiToken: " token-value ",
    } satisfies ProviderConfig;

    const normalized = normalizeProviderConfigForAISDK(providerConfig);

    expect(normalized.apiKey).toBe("token-value");
    expect("apiToken" in normalized).toBe(false);
  });

  test("prefers existing apiKey when both apiKey and apiToken are present", () => {
    const providerConfig = {
      apiKey: " explicit-key ",
      apiToken: " token-should-not-overwrite ",
    } satisfies ProviderConfig;

    const normalized = normalizeProviderConfigForAISDK(providerConfig);

    expect(normalized.apiKey).toBe("explicit-key");
    expect("apiToken" in normalized).toBe(false);
  });
});

/**
 * Test that provider registry structure is correct
 */

import { describe, test, expect } from "bun:test";
import { PROVIDER_REGISTRY, SUPPORTED_PROVIDERS, isValidProvider, type ProviderName } from "./providers";

describe("Provider Registry", () => {
  test("PROVIDER_REGISTRY maps all providers to valid npm packages", () => {
    // Verify structure: each provider should map to a package name
    const entries = Object.entries(PROVIDER_REGISTRY);
    
    expect(entries.length).toBeGreaterThan(0);
    
    for (const [providerName, packageName] of entries) {
      expect(typeof providerName).toBe("string");
      expect(typeof packageName).toBe("string");
      expect(providerName.length).toBeGreaterThan(0);
      // Package names should be scoped (@org/pkg) or plain (pkg)
      expect(packageName).toMatch(/^(@[\w-]+\/)?[\w-]+$/);
    }
  });

  test("PROVIDER_REGISTRY includes expected providers with correct packages", () => {
    expect(PROVIDER_REGISTRY.anthropic).toBe("@ai-sdk/anthropic");
    expect(PROVIDER_REGISTRY.openai).toBe("@ai-sdk/openai");
    expect(PROVIDER_REGISTRY.ollama).toBe("ollama-ai-provider-v2");
    expect(PROVIDER_REGISTRY.openrouter).toBe("@openrouter/ai-sdk-provider");
  });

  test("SUPPORTED_PROVIDERS array matches PROVIDER_REGISTRY keys", () => {
    const registryKeys = (Object.keys(PROVIDER_REGISTRY) as ProviderName[]).sort();
    const supportedProviders = SUPPORTED_PROVIDERS.slice().sort();
    
    expect(supportedProviders).toEqual(registryKeys);
  });

  test("isValidProvider correctly identifies valid providers", () => {
    expect(isValidProvider("anthropic")).toBe(true);
    expect(isValidProvider("openai")).toBe(true);
    expect(isValidProvider("ollama")).toBe(true);
    expect(isValidProvider("openrouter")).toBe(true);
  });

  test("isValidProvider rejects invalid providers", () => {
    expect(isValidProvider("invalid")).toBe(false);
    expect(isValidProvider("")).toBe(false);
    expect(isValidProvider("gpt-4")).toBe(false);
    expect(isValidProvider("anthropic-")).toBe(false);
  });

  test("ProviderName type correctly narrows provider strings", () => {
    // This is a compile-time test, but we can verify runtime behavior
    const validProvider: ProviderName = "anthropic";
    expect(PROVIDER_REGISTRY[validProvider]).toBeDefined();
    
    // @ts-expect-error - This should fail at compile time
    const invalidProvider: ProviderName = "invalid";
  });
});

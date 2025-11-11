/**
 * Test that SUPPORTED_PROVIDERS stays in sync
 */

import { describe, test, expect } from "bun:test";
import { SUPPORTED_PROVIDERS, isValidProvider } from "./providers";

describe("Provider Registry", () => {
  test("SUPPORTED_PROVIDERS includes all expected providers", () => {
    const expected = ["anthropic", "openai", "ollama", "openrouter"] as const;
    expect([...SUPPORTED_PROVIDERS]).toEqual([...expected]);
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
  });
});

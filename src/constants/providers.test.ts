/**
 * Test that provider registry structure is correct
 */

import { describe, test, expect } from "bun:test";
import { PROVIDER_REGISTRY, SUPPORTED_PROVIDERS, isValidProvider } from "./providers";

describe("Provider Registry", () => {
  test("registry is not empty", () => {
    expect(Object.keys(PROVIDER_REGISTRY).length).toBeGreaterThan(0);
  });

  test("all package names follow npm conventions", () => {
    // Package names should be scoped (@org/pkg) or plain (pkg)
    for (const packageName of Object.values(PROVIDER_REGISTRY)) {
      expect(packageName).toMatch(/^(@[\w-]+\/)?[\w-]+$/);
    }
  });

  test("SUPPORTED_PROVIDERS array stays in sync with registry keys", () => {
    // If these don't match, derived array is out of sync
    expect(SUPPORTED_PROVIDERS.length).toBe(Object.keys(PROVIDER_REGISTRY).length);
  });

  test("isValidProvider rejects invalid providers", () => {
    expect(isValidProvider("invalid")).toBe(false);
    expect(isValidProvider("")).toBe(false);
    expect(isValidProvider("gpt-4")).toBe(false);
  });
});

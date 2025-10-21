import { describe, expect, it } from "bun:test";
import type { ProviderConfig } from "@/config";
import { normalizeProviderBaseUrl } from "./normalizeProviderBaseUrl";

describe("normalizeProviderBaseUrl", () => {
  it("returns an empty object when config is undefined", () => {
    expect(normalizeProviderBaseUrl(undefined)).toEqual({});
  });

  it("synchronizes baseUrl and baseURL when baseUrl is provided", () => {
    const original: ProviderConfig = {
      baseUrl: " https://example.com ",
      apiKey: "test-key",
    };

    const result = normalizeProviderBaseUrl(original);
    const record = result as Record<string, unknown>;

    expect(result.baseUrl).toBe("https://example.com");
    expect(record.baseURL).toBe("https://example.com");
    expect(original.baseUrl).toBe(" https://example.com ");
  });

  it("synchronizes baseUrl when only baseURL is provided", () => {
    const original = {
      apiKey: "test-key",
      baseURL: "https://upper.example.com",
    } as unknown as ProviderConfig;

    const result = normalizeProviderBaseUrl(original);
    const record = result as Record<string, unknown>;

    expect(result.baseUrl).toBe("https://upper.example.com");
    expect(record.baseURL).toBe("https://upper.example.com");
  });

  it("does not mutate the original object", () => {
    const original: ProviderConfig = {
      baseUrl: " https://mutate.example.com/ ",
    };

    const copy = { ...original };
    const result = normalizeProviderBaseUrl(original);

    expect(original).toEqual(copy);
    expect(result.baseUrl).toBe("https://mutate.example.com/");
  });
});


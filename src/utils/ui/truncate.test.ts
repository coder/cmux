import { truncateFromStart } from "./truncate";

describe("truncateFromStart", () => {
  it("should not truncate strings shorter than maxLength", () => {
    expect(truncateFromStart("short", 20)).toBe("short");
    expect(truncateFromStart("exact", 5)).toBe("exact");
  });

  it("should truncate long strings showing the end", () => {
    expect(truncateFromStart("anthropic:claude-sonnet-4-5", 20)).toBe("...claude-sonnet-4-5");
    expect(truncateFromStart("openai:gpt-5-preview-2025-01-15", 20)).toBe("...review-2025-01-15");
  });

  it("should handle very short maxLength", () => {
    expect(truncateFromStart("long-model-name", 6)).toBe("...ame");
    expect(truncateFromStart("xyz", 3)).toBe("xyz");
  });

  it("should use default maxLength of 20", () => {
    const longText = "this-is-a-very-long-model-name-that-exceeds-default";
    const result = truncateFromStart(longText);
    expect(result).toBe("...t-exceeds-default");
    expect(result.length).toBe(20);
  });

  it("should preserve distinctive model endings", () => {
    // Most important part of model name is at the end
    expect(truncateFromStart("anthropic:claude-opus-4-20250514", 20)).toBe("...e-opus-4-20250514");
    expect(truncateFromStart("anthropic:claude-sonnet-4-5", 20)).toBe("...claude-sonnet-4-5");
  });
});

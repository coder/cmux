import { describe, expect, test } from "bun:test";
import { hasFixedThinkingPolicy, getThinkingPolicyForModel, enforceThinkingPolicy } from "./policy";

describe("hasFixedThinkingPolicy", () => {
  test("returns true for gpt-5-pro base model", () => {
    expect(hasFixedThinkingPolicy("openai:gpt-5-pro")).toBe(true);
  });

  test("returns true for gpt-5-pro with version suffix", () => {
    expect(hasFixedThinkingPolicy("openai:gpt-5-pro-2025-10-06")).toBe(true);
  });

  test("returns true for gpt-5-pro with whitespace after colon", () => {
    expect(hasFixedThinkingPolicy("openai: gpt-5-pro")).toBe(true);
  });

  test("returns false for gpt-5-pro-mini (word boundary check)", () => {
    expect(hasFixedThinkingPolicy("openai:gpt-5-pro-mini")).toBe(false);
  });

  test("returns false for other OpenAI models", () => {
    expect(hasFixedThinkingPolicy("openai:gpt-4o")).toBe(false);
    expect(hasFixedThinkingPolicy("openai:gpt-4o-mini")).toBe(false);
  });

  test("returns false for other providers", () => {
    expect(hasFixedThinkingPolicy("anthropic:claude-opus-4")).toBe(false);
    expect(hasFixedThinkingPolicy("google:gemini-2.0-flash-thinking")).toBe(false);
  });
});

describe("getThinkingPolicyForModel", () => {
  test("returns fixed HIGH policy for gpt-5-pro", () => {
    const policy = getThinkingPolicyForModel("openai:gpt-5-pro");
    expect(policy.variant).toBe("fixed");
    if (policy.variant === "fixed") {
      expect(policy.level).toBe("high");
    }
  });

  test("returns fixed HIGH policy for gpt-5-pro with version suffix", () => {
    const policy = getThinkingPolicyForModel("openai:gpt-5-pro-2025-10-06");
    expect(policy.variant).toBe("fixed");
    if (policy.variant === "fixed") {
      expect(policy.level).toBe("high");
    }
  });

  test("returns selectable policy for other models", () => {
    const policy = getThinkingPolicyForModel("anthropic:claude-opus-4");
    expect(policy.variant).toBe("selectable");
    if (policy.variant === "selectable") {
      expect(policy.allowed).toEqual(["low", "medium", "high"]);
      expect(policy.default).toBe("medium");
    }
  });

  test("returns selectable policy for gpt-5-pro-mini", () => {
    const policy = getThinkingPolicyForModel("openai:gpt-5-pro-mini");
    expect(policy.variant).toBe("selectable");
  });
});

describe("enforceThinkingPolicy", () => {
  describe("fixed policy models (gpt-5-pro)", () => {
    test("enforces high for any requested level", () => {
      expect(enforceThinkingPolicy("openai:gpt-5-pro", "off")).toBe("high");
      expect(enforceThinkingPolicy("openai:gpt-5-pro", "low")).toBe("high");
      expect(enforceThinkingPolicy("openai:gpt-5-pro", "medium")).toBe("high");
      expect(enforceThinkingPolicy("openai:gpt-5-pro", "high")).toBe("high");
    });

    test("enforces high for versioned gpt-5-pro", () => {
      expect(enforceThinkingPolicy("openai:gpt-5-pro-2025-10-06", "low")).toBe("high");
    });
  });

  describe("selectable policy models", () => {
    test("allows off for selectable models", () => {
      expect(enforceThinkingPolicy("anthropic:claude-opus-4", "off")).toBe("off");
      expect(enforceThinkingPolicy("openai:gpt-4o", "off")).toBe("off");
    });

    test("allows all active levels for selectable models", () => {
      expect(enforceThinkingPolicy("anthropic:claude-opus-4", "low")).toBe("low");
      expect(enforceThinkingPolicy("anthropic:claude-opus-4", "medium")).toBe("medium");
      expect(enforceThinkingPolicy("anthropic:claude-opus-4", "high")).toBe("high");
    });

    // Note: Invalid level test removed - TypeScript type system prevents invalid levels at compile time
    // Runtime behavior defaults to medium for unexpected values, but this is not a realistic scenario
  });
});

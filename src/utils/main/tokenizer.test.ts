import { describe, expect, test } from "bun:test";

import { getTokenizerForModel, loadTokenizerForModel, loadTokenizerModules } from "./tokenizer";

describe("tokenizer caching", () => {
  test("does not cache fallback approximations", async () => {
    await loadTokenizerModules();

    const model = "openai:gpt-4-turbo";
    const tokenizer = getTokenizerForModel(model);
    const text = "cmux-fallback-check-" + "a".repeat(40);

    const fallbackCount = tokenizer.countTokens(text);
    const approximation = Math.ceil(text.length / 4);
    expect(fallbackCount).toBe(approximation);

    await loadTokenizerForModel(model);

    const accurateCount = tokenizer.countTokens(text);

    expect(accurateCount).not.toBe(fallbackCount);
    expect(accurateCount).toBeGreaterThan(0);
    expect(accurateCount).toBeLessThan(fallbackCount);
  });
});

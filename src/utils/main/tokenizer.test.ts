import { beforeEach, describe, expect, test } from "bun:test";

import {
  __resetTokenizerForTests,
  getTokenizerForModel,
  loadTokenizerForModel,
  loadTokenizerModules,
  onTokenizerEncodingLoaded,
} from "./tokenizer";

beforeEach(() => {
  __resetTokenizerForTests();
});

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
  });

  test("replays loaded encodings for late listeners", async () => {
    const model = "openai:gpt-4o";
    await loadTokenizerForModel(model);

    const received: string[] = [];
    const unsubscribe = onTokenizerEncodingLoaded((encodingName) => {
      received.push(encodingName);
    });
    unsubscribe();

    expect(received.length).toBeGreaterThan(0);
    expect(received).toContain("o200k_base");
  });

  test("accurate counts replace fallback approximations", async () => {
    const model = "openai:gpt-4-turbo";
    const tokenizer = getTokenizerForModel(model);
    const text = "cmux-accuracy-check-" + "b".repeat(80);

    let unsubscribe: () => void = () => undefined;
    const encodingReady = new Promise<void>((resolve) => {
      unsubscribe = onTokenizerEncodingLoaded((encodingName) => {
        if (encodingName === "cl100k_base") {
          unsubscribe();
          resolve();
        }
      });
    });

    const fallbackCount = tokenizer.countTokens(text);
    const approximation = Math.ceil(text.length / 4);
    expect(fallbackCount).toBe(approximation);

    await encodingReady;
    await Promise.resolve();

    const accurateCount = tokenizer.countTokens(text);
    expect(accurateCount).not.toBe(fallbackCount);
    expect(accurateCount).toBeGreaterThan(0);

    const cachedCount = tokenizer.countTokens(text);
    expect(cachedCount).toBe(accurateCount);
  });
});

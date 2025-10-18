/**
 * Tests for compaction options transformation
 */

import { applyCompactionOverrides } from "./compactionOptions";
import type { SendMessageOptions } from "@/types/ipc";
import type { CompactionRequestData } from "@/types/message";

describe("applyCompactionOverrides", () => {
  const baseOptions: SendMessageOptions = {
    model: "anthropic:claude-sonnet-4-5",
    thinkingLevel: "medium",
    toolPolicy: [],
    mode: "exec",
  };

  it("uses workspace model when no override specified", () => {
    const compactData: CompactionRequestData = {};
    const result = applyCompactionOverrides(baseOptions, compactData);

    expect(result.model).toBe("anthropic:claude-sonnet-4-5");
    expect(result.mode).toBe("compact");
  });

  it("applies custom model override", () => {
    const compactData: CompactionRequestData = {
      model: "anthropic:claude-haiku-4-5",
    };
    const result = applyCompactionOverrides(baseOptions, compactData);

    expect(result.model).toBe("anthropic:claude-haiku-4-5");
  });

  it("sets thinking to off for Anthropic models", () => {
    const compactData: CompactionRequestData = {
      model: "anthropic:claude-haiku-4-5",
    };
    const result = applyCompactionOverrides(baseOptions, compactData);

    expect(result.thinkingLevel).toBe("off");
  });

  it("preserves workspace thinking level for non-Anthropic models", () => {
    const compactData: CompactionRequestData = {
      model: "openai:gpt-5-pro",
    };
    const result = applyCompactionOverrides(baseOptions, compactData);

    expect(result.thinkingLevel).toBe("medium");
  });

  it("applies maxOutputTokens override", () => {
    const compactData: CompactionRequestData = {
      maxOutputTokens: 8000,
    };
    const result = applyCompactionOverrides(baseOptions, compactData);

    expect(result.maxOutputTokens).toBe(8000);
  });

  it("sets compact mode and disables all tools", () => {
    const compactData: CompactionRequestData = {};
    const result = applyCompactionOverrides(baseOptions, compactData);

    expect(result.mode).toBe("compact");
    expect(result.toolPolicy).toEqual([]);
  });

  it("disables all tools even when base options has tool policy", () => {
    const baseWithTools: SendMessageOptions = {
      ...baseOptions,
      toolPolicy: [{ regex_match: "bash", action: "enable" }],
    };
    const compactData: CompactionRequestData = {};
    const result = applyCompactionOverrides(baseWithTools, compactData);

    expect(result.mode).toBe("compact");
    expect(result.toolPolicy).toEqual([]); // Tools always disabled for compaction
  });

  it("applies all overrides together", () => {
    const compactData: CompactionRequestData = {
      model: "openai:gpt-5",
      maxOutputTokens: 5000,
    };
    const result = applyCompactionOverrides(baseOptions, compactData);

    expect(result.model).toBe("openai:gpt-5");
    expect(result.maxOutputTokens).toBe(5000);
    expect(result.mode).toBe("compact");
    expect(result.thinkingLevel).toBe("medium"); // Non-Anthropic preserves original
  });
});

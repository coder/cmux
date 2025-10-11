/**
 * Thinking/Reasoning level types and mappings for AI models
 *
 * This module provides a unified interface for controlling reasoning across
 * different AI providers (Anthropic, OpenAI, etc.)
 */

export type ThinkingLevel = "off" | "low" | "medium" | "high";

/**
 * Active thinking levels (excludes "off")
 * Used for storing/restoring the last-used thinking level per model
 */
export type ThinkingLevelOn = Exclude<ThinkingLevel, "off">;

/**
 * Anthropic thinking token budget mapping
 *
 * These heuristics balance thinking depth with response time and cost:
 * - off: No extended thinking
 * - low: Quick thinking for straightforward tasks (4K tokens)
 * - medium: Standard thinking for moderate complexity (10K tokens)
 * - high: Deep thinking for complex problems (20K tokens)
 */
export const ANTHROPIC_THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  off: 0,
  low: 4000,
  medium: 10000,
  high: 20000,
};

/**
 * Default thinking level to use when toggling thinking on
 * if no previous value is stored for the model
 */
export const DEFAULT_THINKING_LEVEL: ThinkingLevelOn = "medium";

/**
 * OpenAI reasoning_effort mapping
 *
 * Maps our unified levels to OpenAI's reasoningEffort parameter
 * (used by o1, o3-mini, gpt-5, etc.)
 */
export const OPENAI_REASONING_EFFORT: Record<ThinkingLevel, string | undefined> = {
  off: undefined,
  low: "low",
  medium: "medium",
  high: "high",
};

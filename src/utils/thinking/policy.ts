/**
 * Thinking policy per model
 *
 * Centralizes which thinking levels are allowed for a given model and exposes
 * helpers to enforce those rules consistently in UI and provider options.
 *
 * Positive externalities:
 * - Single source of truth used by UI (toggles, keybinds) and provider options
 * - Easy to extend when other models have fixed/limited thinking levels
 */

import type { ThinkingLevel, ThinkingLevelOn } from "@/types/thinking";

export type ThinkingPolicy =
  | { variant: "fixed"; level: Extract<ThinkingLevel, "high"> }
  | { variant: "selectable"; allowed: ThinkingLevelOn[]; default: ThinkingLevelOn };

/**
 * Check if a model has a fixed thinking policy (e.g., gpt-5-pro only supports HIGH)
 *
 * Used by UI components that need to disable controls for fixed-policy models.
 * Tolerates version suffixes (e.g., gpt-5-pro-2025-10-06).
 * Does NOT match gpt-5-pro-mini (uses negative lookahead to exclude -mini suffix).
 */
export function hasFixedThinkingPolicy(modelString: string): boolean {
  // Match "openai:" followed by optional whitespace and "gpt-5-pro"
  // Allow version suffixes like "-2025-10-06" but NOT "-mini" or other text suffixes
  // Use negative lookahead to exclude -mini/-micro etc.
  return /^openai:\s*gpt-5-pro(?!-[a-z])/.test(modelString);
}

/**
 * Returns the thinking policy for a given model.
 *
 * Rules:
 * - openai:gpt-5-pro → fixed HIGH (only supported level)
 * - default → selectable [low, medium, high] (UI may still toggle off globally)
 */
export function getThinkingPolicyForModel(modelString: string): ThinkingPolicy {
  if (hasFixedThinkingPolicy(modelString)) {
    return { variant: "fixed", level: "high" };
  }

  // Default policy: all active levels allowed, default to medium
  return { variant: "selectable", allowed: ["low", "medium", "high"], default: "medium" };
}

/**
 * Clamp a requested thinking level to the model's policy.
 */
export function enforceThinkingPolicy(
  modelString: string,
  requested: ThinkingLevel
): ThinkingLevel {
  const policy = getThinkingPolicyForModel(modelString);
  if (policy.variant === "fixed") {
    return policy.level;
  }

  // Allow "off" as a global toggle for selectable models
  if (requested === "off") return "off";

  // Otherwise ensure it's one of the allowed active levels
  return policy.allowed.includes(requested as ThinkingLevelOn) ? requested : policy.default;
}

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
 * Returns the thinking policy for a given model.
 *
 * Rules:
 * - openai:gpt-5-pro → fixed HIGH (only supported level)
 * - default → selectable [low, medium, high] (UI may still toggle off globally)
 */
export function getThinkingPolicyForModel(modelString: string): ThinkingPolicy {
  const [provider, modelId = ""] = modelString.split(":");

  // Be tolerant of future version suffixes (e.g., gpt-5-pro-2025-10-06)
  if (provider === "openai" && /\bgpt-5-pro\b/.test(modelId)) {
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
  if (policy.variant == "fixed") {
    return policy.level;
  }

  // Allow "off" as a global toggle for selectable models
  if (requested === "off") return "off";

  // Otherwise ensure it's one of the allowed active levels
  return policy.allowed.includes(requested as ThinkingLevelOn) ? requested : policy.default;
}

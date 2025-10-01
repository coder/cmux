/**
 * Provider options builder for AI SDK
 *
 * Converts unified thinking levels to provider-specific options
 */

import {
  ThinkingLevel,
  ANTHROPIC_THINKING_BUDGETS,
  OPENAI_REASONING_EFFORT,
} from "../types/thinking";
import { log } from "../services/log";

/**
 * Build provider-specific options for AI SDK based on thinking level
 *
 * @param modelString - Full model string (e.g., "anthropic:claude-opus-4-1")
 * @param thinkingLevel - Unified thinking level
 * @returns Provider options object for AI SDK
 */
export function buildProviderOptions(
  modelString: string,
  thinkingLevel: ThinkingLevel
): Record<string, unknown> {
  // Parse provider from model string
  const [provider] = modelString.split(":");

  log.debug("buildProviderOptions", {
    modelString,
    provider,
    thinkingLevel,
  });

  if (!provider) {
    log.debug("buildProviderOptions: No provider found, returning empty");
    return {};
  }

  // Return early if thinking is off
  if (thinkingLevel === "off") {
    log.debug("buildProviderOptions: Thinking is off, returning empty");
    return {};
  }

  // Build Anthropic-specific options
  if (provider === "anthropic") {
    const budgetTokens = ANTHROPIC_THINKING_BUDGETS[thinkingLevel];
    log.debug("buildProviderOptions: Anthropic thinking config", {
      budgetTokens,
      thinkingLevel,
    });
    if (budgetTokens > 0) {
      const options = {
        anthropic: {
          thinking: {
            type: "enabled",
            budgetTokens,
          },
        },
      };
      log.info("buildProviderOptions: Returning Anthropic options", options);
      return options;
    }
  }

  // Build OpenAI-specific options
  if (provider === "openai") {
    const reasoningEffort = OPENAI_REASONING_EFFORT[thinkingLevel];
    log.debug("buildProviderOptions: OpenAI reasoning config", {
      reasoningEffort,
      thinkingLevel,
    });
    if (reasoningEffort) {
      const options = {
        openai: {
          reasoningEffort,
        },
      };
      log.info("buildProviderOptions: Returning OpenAI options", options);
      return options;
    }
  }

  // No thinking support for this provider
  log.debug("buildProviderOptions: No thinking support for provider", provider);
  return {};
}

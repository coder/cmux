/**
 * Provider options builder for AI SDK
 *
 * Converts unified thinking levels to provider-specific options
 */

import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { ThinkingLevel } from "../types/thinking";
import { ANTHROPIC_THINKING_BUDGETS, OPENAI_REASONING_EFFORT } from "../types/thinking";
import { log } from "../services/log";
import type { CmuxMessage } from "../types/message";

/**
 * Provider-specific options structure for AI SDK
 */
type ProviderOptions =
  | { anthropic: AnthropicProviderOptions }
  | { openai: OpenAIResponsesProviderOptions }
  | Record<string, never>; // Empty object for unsupported providers

/**
 * Build provider-specific options for AI SDK based on thinking level
 *
 * This function configures provider-specific options for supported providers:
 * 1. Enable reasoning traces (transparency into model's thought process)
 * 2. Set reasoning level (control depth of reasoning based on task complexity)
 * 3. Enable parallel tool calls (allow concurrent tool execution)
 * 4. Extract previousResponseId for OpenAI persistence (when available)
 *
 * @param modelString - Full model string (e.g., "anthropic:claude-opus-4-1")
 * @param thinkingLevel - Unified thinking level
 * @param messages - Conversation history to extract previousResponseId from
 * @returns Provider options object for AI SDK
 */
export function buildProviderOptions(
  modelString: string,
  thinkingLevel: ThinkingLevel,
  messages?: CmuxMessage[]
): ProviderOptions {
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

  // Build Anthropic-specific options
  if (provider === "anthropic") {
    const budgetTokens = ANTHROPIC_THINKING_BUDGETS[thinkingLevel];
    log.debug("buildProviderOptions: Anthropic config", {
      budgetTokens,
      thinkingLevel,
    });

    const options: ProviderOptions = {
      anthropic: {
        disableParallelToolUse: false, // Always enable concurrent tool execution
        sendReasoning: true, // Include reasoning traces in requests sent to the model
        // Conditionally add thinking configuration
        ...(budgetTokens > 0 && {
          thinking: {
            type: "enabled",
            budgetTokens,
          },
        }),
      },
    };
    log.info("buildProviderOptions: Returning Anthropic options", options);
    return options;
  }

  // Build OpenAI-specific options
  if (provider === "openai") {
    const reasoningEffort = OPENAI_REASONING_EFFORT[thinkingLevel];

    // Extract previousResponseId from last assistant message for persistence
    let previousResponseId: string | undefined;
    if (messages && messages.length > 0) {
      // Find last assistant message
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          const metadata = messages[i].metadata?.providerMetadata;
          if (metadata && "openai" in metadata) {
            const openaiData = metadata.openai as Record<string, unknown> | undefined;
            previousResponseId = openaiData?.responseId as string | undefined;
          }
          if (previousResponseId) {
            log.debug("buildProviderOptions: Found previousResponseId", { previousResponseId });
            break;
          }
        }
      }
    }

    log.debug("buildProviderOptions: OpenAI config", {
      reasoningEffort,
      thinkingLevel,
      previousResponseId,
    });

    const options: ProviderOptions = {
      openai: {
        parallelToolCalls: true, // Always enable concurrent tool execution
        // TODO: allow this to be configured
        serviceTier: "priority", // Always use priority tier for best performance
        // Conditionally add reasoning configuration
        ...(reasoningEffort && {
          reasoningEffort,
          reasoningSummary: "detailed", // Enable detailed reasoning summaries
        }),
        // Include previousResponseId for persistence (Responses API)
        ...(previousResponseId && { previousResponseId }),
      },
    };
    log.info("buildProviderOptions: Returning OpenAI options", options);
    return options;
  }

  // No provider-specific options for unsupported providers
  log.debug("buildProviderOptions: Unsupported provider", provider);
  return {};
}

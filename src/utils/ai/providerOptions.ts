/**
 * Provider options builder for AI SDK
 *
 * Converts unified thinking levels to provider-specific options
 */

import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { ThinkingLevel } from "@/types/thinking";
import { ANTHROPIC_THINKING_BUDGETS, OPENAI_REASONING_EFFORT } from "@/types/thinking";
import { log } from "@/services/log";
import type { CmuxMessage } from "@/types/message";
import { enforceThinkingPolicy } from "@/utils/thinking/policy";

/**
 * Extended OpenAI Responses provider options to include truncation
 *
 * NOTE: The SDK types don't yet include this parameter, but it's supported by the OpenAI API.
 * However, the @ai-sdk/openai v2.0.40 implementation does NOT pass truncation from provider
 * options - it only sets it based on modelConfig.requiredAutoTruncation.
 *
 * This type extension is prepared for a future SDK update that will properly map the
 * truncation parameter from provider options to the API request.
 *
 * Current behavior: OpenAI models will NOT use truncation: "auto" until the SDK is updated.
 * Workaround: Use /clear or /compact commands to manage conversation history.
 */
type ExtendedOpenAIResponsesProviderOptions = OpenAIResponsesProviderOptions & {
  truncation?: "auto" | "disabled";
};

/**
 * Provider-specific options structure for AI SDK
 */
type ProviderOptions =
  | { anthropic: AnthropicProviderOptions }
  | { openai: ExtendedOpenAIResponsesProviderOptions }
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
  // Always clamp to the model's supported thinking policy (e.g., gpt-5-pro = HIGH only)
  const effectiveThinking = enforceThinkingPolicy(modelString, thinkingLevel);
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
    const budgetTokens = ANTHROPIC_THINKING_BUDGETS[effectiveThinking];
    log.debug("buildProviderOptions: Anthropic config", {
      budgetTokens,
      thinkingLevel: effectiveThinking,
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
    const reasoningEffort = OPENAI_REASONING_EFFORT[effectiveThinking];

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
      thinkingLevel: effectiveThinking,
      previousResponseId,
    });

    const options: ProviderOptions = {
      openai: {
        parallelToolCalls: true, // Always enable concurrent tool execution
        // TODO: allow this to be configured
        serviceTier: "priority", // Always use priority tier for best performance
        truncation: "auto", // Automatically truncate conversation to fit context window
        // Conditionally add reasoning configuration
        ...(reasoningEffort && {
          reasoningEffort,
          reasoningSummary: "detailed", // Enable detailed reasoning summaries
          // Include reasoning encrypted content to preserve reasoning context across conversation steps
          // Required when using reasoning models (gpt-5, o3, o4-mini) with tool calls
          // See: https://sdk.vercel.ai/providers/ai-sdk-providers/openai#responses-models
          include: ["reasoning.encrypted_content"],
        }),
        // IMPORTANT: Do NOT use previousResponseId when reasoning is present
        // OpenAI assigns itemIds in responses that reference reasoning items
        // When we filter reasoning but OpenAI still has previousResponseId,
        // it tries to link to missing reasoning items, causing errors
        // Trade-off: Losing previousResponseId means OpenAI can't optimize context,
        // but it prevents the itemId reference errors
        // ...(previousResponseId && { previousResponseId }),  // DISABLED - causes itemId errors
      },
    };
    log.info("buildProviderOptions: Returning OpenAI options", options);
    return options;
  }

  // No provider-specific options for unsupported providers
  log.debug("buildProviderOptions: Unsupported provider", provider);
  return {};
}

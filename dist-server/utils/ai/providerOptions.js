"use strict";
/**
 * Provider options builder for AI SDK
 *
 * Converts unified thinking levels to provider-specific options
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProviderOptions = buildProviderOptions;
const thinking_1 = require("../../types/thinking");
const log_1 = require("../../services/log");
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
function buildProviderOptions(modelString, thinkingLevel, messages) {
    // Parse provider from model string
    const [provider] = modelString.split(":");
    log_1.log.debug("buildProviderOptions", {
        modelString,
        provider,
        thinkingLevel,
    });
    if (!provider) {
        log_1.log.debug("buildProviderOptions: No provider found, returning empty");
        return {};
    }
    // Build Anthropic-specific options
    if (provider === "anthropic") {
        const budgetTokens = thinking_1.ANTHROPIC_THINKING_BUDGETS[thinkingLevel];
        log_1.log.debug("buildProviderOptions: Anthropic config", {
            budgetTokens,
            thinkingLevel,
        });
        const options = {
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
        log_1.log.info("buildProviderOptions: Returning Anthropic options", options);
        return options;
    }
    // Build OpenAI-specific options
    if (provider === "openai") {
        const reasoningEffort = thinking_1.OPENAI_REASONING_EFFORT[thinkingLevel];
        // Extract previousResponseId from last assistant message for persistence
        let previousResponseId;
        if (messages && messages.length > 0) {
            // Find last assistant message
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === "assistant") {
                    const metadata = messages[i].metadata?.providerMetadata;
                    if (metadata && "openai" in metadata) {
                        const openaiData = metadata.openai;
                        previousResponseId = openaiData?.responseId;
                    }
                    if (previousResponseId) {
                        log_1.log.debug("buildProviderOptions: Found previousResponseId", { previousResponseId });
                        break;
                    }
                }
            }
        }
        log_1.log.debug("buildProviderOptions: OpenAI config", {
            reasoningEffort,
            thinkingLevel,
            previousResponseId,
        });
        const options = {
            openai: {
                parallelToolCalls: true, // Always enable concurrent tool execution
                // TODO: allow this to be configured
                serviceTier: "priority", // Always use priority tier for best performance
                // Conditionally add reasoning configuration
                ...(reasoningEffort && {
                    reasoningEffort,
                    reasoningSummary: "detailed", // Enable detailed reasoning summaries
                    // Include reasoning encrypted content to preserve reasoning context across conversation steps
                    // Required when using reasoning models (gpt-5, o3, o4-mini) with tool calls
                    // See: https://sdk.vercel.ai/providers/ai-sdk-providers/openai#responses-models
                    include: ["reasoning.encrypted_content"],
                }),
                // Include previousResponseId for persistence (Responses API)
                ...(previousResponseId && { previousResponseId }),
            },
        };
        log_1.log.info("buildProviderOptions: Returning OpenAI options", options);
        return options;
    }
    // No provider-specific options for unsupported providers
    log_1.log.debug("buildProviderOptions: Unsupported provider", provider);
    return {};
}
//# sourceMappingURL=providerOptions.js.map
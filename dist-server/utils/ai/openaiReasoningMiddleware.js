"use strict";
/**
 * OpenAI Reasoning Middleware
 *
 * Fixes the "reasoning without following item" error by ensuring reasoning items
 * in the prompt are properly formatted for OpenAI's Responses API.
 *
 * The issue: OpenAI's streaming responses sometimes fail with:
 * "Item 'rs_*' of type 'reasoning' was provided without its required following item"
 *
 * This occurs when:
 * - The conversation includes previous reasoning parts in history
 * - OpenAI's Responses API expects reasoning items to be paired with content
 *
 * Solution: Strip reasoning items from the input messages before sending to OpenAI,
 * since OpenAI manages reasoning state via `previousResponseId` parameter.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiReasoningFixMiddleware = void 0;
const log_1 = require("../../services/log");
exports.openaiReasoningFixMiddleware = {
    transformParams: ({ params, }) => {
        // Only process if we have messages
        if (!params.prompt || !Array.isArray(params.prompt)) {
            return Promise.resolve(params);
        }
        log_1.log.debug("[OpenAI Middleware] Transforming params to fix reasoning items");
        log_1.log.debug(`[OpenAI Middleware] Input has ${params.prompt.length} messages`);
        // Clone the prompt array to avoid mutations
        const transformedPrompt = params.prompt
            .map((message) => {
            // Only process assistant messages (reasoning comes from assistant)
            if (message.role !== "assistant") {
                return message;
            }
            // Filter out reasoning content from assistant messages
            if (Array.isArray(message.content)) {
                // Check if this message contains reasoning
                const _hasReasoning = message.content.some((part) => typeof part === "object" &&
                    part !== null &&
                    "type" in part &&
                    part.type === "reasoning");
                const filteredContent = message.content
                    .filter((part) => {
                    // Remove reasoning parts - OpenAI manages these via previousResponseId
                    if (typeof part === "object" && part !== null && "type" in part) {
                        return part.type !== "reasoning";
                    }
                    return true;
                })
                    .map((part) => {
                    // Always strip OpenAI item IDs from parts that have them
                    // OpenAI manages these via previousResponseId, not via message content
                    if (typeof part === "object" && part !== null) {
                        // Check if part has providerOptions.openai.itemId
                        const partObj = part;
                        if ("providerOptions" in partObj &&
                            typeof partObj.providerOptions === "object" &&
                            partObj.providerOptions !== null &&
                            "openai" in partObj.providerOptions) {
                            // Strip the OpenAI provider options that contain item IDs
                            const { providerOptions, ...restOfPart } = partObj;
                            const { openai, ...restOfProviderOptions } = providerOptions;
                            log_1.log.debug(`[OpenAI Middleware] Stripped OpenAI itemId from ${part.type ?? "unknown"} part`);
                            // If there are other provider options, keep them
                            if (Object.keys(restOfProviderOptions).length > 0) {
                                return { ...restOfPart, providerOptions: restOfProviderOptions };
                            }
                            // Otherwise return without providerOptions
                            return restOfPart;
                        }
                    }
                    return part;
                });
                // If all content was reasoning, remove this message entirely
                if (filteredContent.length === 0 && message.content.length > 0) {
                    log_1.log.debug("[OpenAI Middleware] Removed reasoning-only assistant message from prompt");
                    // Return null to signal this message should be removed
                    return null;
                }
                return {
                    ...message,
                    content: filteredContent,
                };
            }
            return message;
        })
            .filter((msg) => msg !== null); // Remove null messages
        log_1.log.debug(`[OpenAI Middleware] Filtered ${params.prompt.length - transformedPrompt.length} reasoning-only messages`);
        return Promise.resolve({
            ...params,
            prompt: transformedPrompt,
        });
    },
};
//# sourceMappingURL=openaiReasoningMiddleware.js.map
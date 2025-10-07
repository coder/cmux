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

import type {
  LanguageModelV2Middleware,
  LanguageModelV2CallOptions,
  LanguageModelV2Message,
} from "@ai-sdk/provider";
import { log } from "@/services/log";

export const openaiReasoningFixMiddleware: LanguageModelV2Middleware = {
  transformParams: async ({
    params,
  }: {
    type: "generate" | "stream";
    params: LanguageModelV2CallOptions;
  }) => {
    // Only process if we have messages
    if (!params.prompt || !Array.isArray(params.prompt)) {
      return params;
    }

    log.debug("[OpenAI Middleware] Transforming params to fix reasoning items");

    // Clone the prompt array to avoid mutations
    const transformedPrompt = params.prompt
      .map((message: LanguageModelV2Message) => {
        // Only process assistant messages (reasoning comes from assistant)
        if (message.role !== "assistant") {
          return message;
        }

        // Filter out reasoning content from assistant messages
        if (Array.isArray(message.content)) {
          const filteredContent = message.content.filter((part) => {
            // Remove reasoning parts - OpenAI manages these via previousResponseId
            if (typeof part === "object" && part !== null && "type" in part) {
              return part.type !== "reasoning";
            }
            return true;
          });

          // If all content was reasoning, remove this message entirely
          if (filteredContent.length === 0 && message.content.length > 0) {
            log.debug(
              "[OpenAI Middleware] Removed reasoning-only assistant message from prompt"
            );
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
      .filter((msg): msg is LanguageModelV2Message => msg !== null); // Remove null messages

    log.debug(
      `[OpenAI Middleware] Filtered ${params.prompt.length - transformedPrompt.length} reasoning-only messages`
    );

    return {
      ...params,
      prompt: transformedPrompt,
    };
  },
};

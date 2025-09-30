/**
 * Shared token statistics calculation logic
 * Used by both frontend (ChatContext) and backend (debug commands)
 *
 * IMPORTANT: This utility is intentionally abstracted so that the debug command
 * (`bun debug costs`) has exact parity with the UI display in the Costs tab.
 * Any changes to token calculation logic should be made here to maintain consistency.
 */

import { CmuxMessage } from "../types/message";
import { ChatStats, TokenConsumer, UsageStats } from "../types/chatStats";
import { getTokenizerForModel, countTokensForData } from "./tokenCalculation";

/**
 * Calculate token statistics from raw CmuxMessages
 * This is the single source of truth for token counting
 *
 * @param messages - Array of CmuxMessages from chat history
 * @param model - Model string (e.g., "anthropic:claude-opus-4-1")
 * @returns ChatStats with token breakdown by consumer and last actual usage
 */
export async function calculateTokenStats(
  messages: CmuxMessage[],
  model: string
): Promise<ChatStats> {
  if (messages.length === 0) {
    return {
      consumers: [],
      totalTokens: 0,
      model,
      tokenizerName: "No messages",
    };
  }

  const tokenizer = getTokenizerForModel(model);
  const consumerMap = new Map<string, number>();
  let lastUsage: UsageStats | undefined;

  // Calculate tokens for each message
  for (const message of messages) {
    if (message.role === "user") {
      // Count all text parts for user messages
      let userTokens = 0;
      for (const part of message.parts) {
        if (part.type === "text") {
          userTokens += await tokenizer.countTokens(part.text);
        }
      }
      consumerMap.set("User", (consumerMap.get("User") || 0) + userTokens);
    } else if (message.role === "assistant") {
      // For assistant messages:
      // 1. Use actual token count from metadata if available (from API response)
      // 2. Otherwise estimate by counting text parts
      let assistantTokens = 0;

      if (message.metadata?.tokens) {
        // Use actual token count from API
        assistantTokens = message.metadata.tokens;

        // Store the last actual usage statistics from API
        if (message.metadata.usage) {
          lastUsage = message.metadata.usage;
        }
      } else {
        // Estimate from text content
        for (const part of message.parts) {
          if (part.type === "text") {
            assistantTokens += await tokenizer.countTokens(part.text);
          }
        }
      }

      consumerMap.set("Assistant", (consumerMap.get("Assistant") || 0) + assistantTokens);

      // Count tool calls separately by tool name
      for (const part of message.parts) {
        if (part.type === "dynamic-tool") {
          // Count tokens for tool args
          const argsTokens = await countTokensForData(part.input, tokenizer);

          // Count tokens for tool results if present
          const resultTokens =
            part.state === "output-available" && part.output
              ? await countTokensForData(part.output, tokenizer)
              : 0;

          const totalToolTokens = argsTokens + resultTokens;
          consumerMap.set(part.toolName, (consumerMap.get(part.toolName) || 0) + totalToolTokens);
        }
      }
    }
  }

  // Calculate total tokens
  const totalTokens = Array.from(consumerMap.values()).reduce((sum, val) => sum + val, 0);

  // Create sorted consumer array (descending by token count)
  const consumers: TokenConsumer[] = Array.from(consumerMap.entries())
    .map(([name, tokens]) => ({
      name,
      tokens,
      percentage: totalTokens > 0 ? (tokens / totalTokens) * 100 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    consumers,
    totalTokens,
    model,
    tokenizerName: tokenizer.name,
    lastUsage,
  };
}

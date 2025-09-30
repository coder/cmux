/**
 * Shared token statistics calculation logic
 * Used by both frontend (ChatContext) and backend (debug commands)
 *
 * IMPORTANT: This utility is intentionally abstracted so that the debug command
 * (`bun debug costs`) has exact parity with the UI display in the Costs tab.
 * Any changes to token calculation logic should be made here to maintain consistency.
 */

import { CmuxMessage } from "../types/message";
import { ChatStats, TokenConsumer } from "../types/chatStats";
import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import {
  getTokenizerForModel,
  countTokensForData,
  getToolDefinitionTokens,
} from "./tokenCalculation";
import { getModelStats } from "./modelStats";

export interface ChatUsageComponent {
  tokens: number;
  cost_usd: number;
}

/**
 * Enhanced usage type for display that includes provider-specific cache stats
 */
export interface ChatUsageDisplay {
  // Input is the part of the input that was not cached. So,
  // totalInput = input + cached (cacheCreate is separate for billing)
  input: ChatUsageComponent;
  cached: ChatUsageComponent;
  cacheCreate: ChatUsageComponent; // Cache creation tokens (separate billing concept)

  // Output is the part of the output excluding reasoning, so
  // totalOutput = output + reasoning
  output: ChatUsageComponent;
  reasoning: ChatUsageComponent;
}

/**
 * Create a display-friendly usage object from standard LanguageModelV2Usage
 */
export function createDisplayUsage(
  usage: LanguageModelV2Usage | undefined,
  model: string,
  providerMetadata?: Record<string, unknown>
): ChatUsageDisplay | undefined {
  if (!usage) return undefined;

  // For Anthropic (and likely other providers), inputTokens already excludes cached tokens
  // cachedInputTokens is a standard field that reports cached token usage
  const inputTokens = usage.inputTokens ?? 0;
  const cachedTokens = usage.cachedInputTokens ?? 0;

  // Extract cache creation tokens from provider metadata (Anthropic-specific)
  const cacheCreateTokens =
    (providerMetadata?.anthropic as { cacheCreationInputTokens?: number } | undefined)
      ?.cacheCreationInputTokens ?? 0;

  // Calculate output tokens excluding reasoning
  const outputWithoutReasoning = Math.max(
    0,
    (usage.outputTokens ?? 0) - (usage.reasoningTokens ?? 0)
  );

  // Get model stats for cost calculation
  const modelStats = getModelStats(model);

  // Calculate costs based on model stats
  let inputCost = 0;
  let cachedCost = 0;
  let cacheCreateCost = 0;
  let outputCost = 0;
  let reasoningCost = 0;

  if (modelStats) {
    inputCost = inputTokens * modelStats.input_cost_per_token;
    cachedCost = cachedTokens * (modelStats.cache_read_input_token_cost ?? 0);
    cacheCreateCost = cacheCreateTokens * (modelStats.cache_creation_input_token_cost ?? 0);
    outputCost = outputWithoutReasoning * modelStats.output_cost_per_token;
    reasoningCost = (usage.reasoningTokens ?? 0) * modelStats.output_cost_per_token;
  }

  return {
    input: {
      tokens: inputTokens,
      cost_usd: inputCost,
    },
    cached: {
      tokens: cachedTokens,
      cost_usd: cachedCost,
    },
    cacheCreate: {
      tokens: cacheCreateTokens,
      cost_usd: cacheCreateCost,
    },
    output: {
      tokens: outputWithoutReasoning,
      cost_usd: outputCost,
    },
    reasoning: {
      tokens: usage.reasoningTokens ?? 0,
      cost_usd: reasoningCost,
    },
  };
}

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
  const consumerMap = new Map<string, { fixed: number; variable: number }>();
  const toolsWithDefinitions = new Set<string>(); // Track which tools have definitions included
  let lastUsage: ChatUsageDisplay | undefined;

  // Calculate tokens by content producer (User, Assistant, individual tools)
  // This shows what activities are consuming tokens, useful for debugging costs
  for (const message of messages) {
    if (message.role === "user") {
      // User message text
      let userTokens = 0;
      for (const part of message.parts) {
        if (part.type === "text") {
          userTokens += await tokenizer.countTokens(part.text);
        }
      }
      const existing = consumerMap.get("User") || { fixed: 0, variable: 0 };
      consumerMap.set("User", { fixed: 0, variable: existing.variable + userTokens });
    } else if (message.role === "assistant") {
      // Store last usage for comparison with estimates
      if (message.metadata?.usage) {
        lastUsage = createDisplayUsage(
          message.metadata.usage,
          model,
          message.metadata.providerMetadata
        );
      }

      // Count assistant text separately from tools
      for (const part of message.parts) {
        if (part.type === "text") {
          const textTokens = await tokenizer.countTokens(part.text);
          const existing = consumerMap.get("Assistant") || { fixed: 0, variable: 0 };
          consumerMap.set("Assistant", { fixed: 0, variable: existing.variable + textTokens });
        } else if (part.type === "dynamic-tool") {
          // Count tool arguments
          const argsTokens = await countTokensForData(part.input, tokenizer);

          // Count tool results if available
          // Tool results have nested structure: { type: "json", value: {...} }
          let resultTokens = 0;
          if (part.state === "output-available" && part.output) {
            // Extract the actual data from the nested output structure
            const outputData =
              typeof part.output === "object" && part.output !== null && "value" in part.output
                ? part.output.value
                : part.output;

            // Special handling for web_search encrypted content
            if (part.toolName === "web_search" && Array.isArray(outputData)) {
              // Check if this is encrypted web search results
              const hasEncryptedContent = outputData.some(
                (item: unknown): item is { encryptedContent: string } =>
                  item !== null &&
                  typeof item === "object" &&
                  "encryptedContent" in item &&
                  typeof (item as Record<string, unknown>).encryptedContent === "string"
              );

              if (hasEncryptedContent) {
                // Calculate tokens for encrypted content with heuristic
                // Encrypted content is base64 encoded and then encrypted/compressed
                // Apply reduction factors:
                // 1. Remove base64 overhead (multiply by 0.75)
                // 2. Apply an estimated token reduction factor of 4
                let encryptedChars = 0;
                for (const item of outputData) {
                  if (
                    item !== null &&
                    typeof item === "object" &&
                    "encryptedContent" in item &&
                    typeof (item as Record<string, unknown>).encryptedContent === "string"
                  ) {
                    encryptedChars += (item as { encryptedContent: string }).encryptedContent
                      .length;
                  }
                }
                // Use heuristic: encrypted chars / 40 for token estimation
                resultTokens = Math.ceil(encryptedChars * 0.75);
              } else {
                // Normal web search results without encryption
                resultTokens = await countTokensForData(outputData, tokenizer);
              }
            } else {
              // Normal tool results
              resultTokens = await countTokensForData(outputData, tokenizer);
            }
          }

          // Get existing or create new consumer for this tool
          const existing = consumerMap.get(part.toolName) || { fixed: 0, variable: 0 };

          // Add tool definition tokens if this is the first time we see this tool
          let fixedTokens = existing.fixed;
          if (!toolsWithDefinitions.has(part.toolName)) {
            fixedTokens += await getToolDefinitionTokens(part.toolName, model);
            toolsWithDefinitions.add(part.toolName);
          }

          // Add variable tokens (args + results)
          const variableTokens = existing.variable + argsTokens + resultTokens;

          consumerMap.set(part.toolName, { fixed: fixedTokens, variable: variableTokens });
        }
      }
    }
  }

  // Calculate total tokens
  const totalTokens = Array.from(consumerMap.values()).reduce(
    (sum, val) => sum + val.fixed + val.variable,
    0
  );

  // Create sorted consumer array (descending by token count)
  const consumers: TokenConsumer[] = Array.from(consumerMap.entries())
    .map(([name, counts]) => {
      const total = counts.fixed + counts.variable;
      return {
        name,
        tokens: total,
        percentage: totalTokens > 0 ? (total / totalTokens) * 100 : 0,
        fixedTokens: counts.fixed > 0 ? counts.fixed : undefined,
        variableTokens: counts.variable > 0 ? counts.variable : undefined,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);

  return {
    consumers,
    totalTokens,
    model,
    tokenizerName: tokenizer.name,
    lastUsage,
  };
}

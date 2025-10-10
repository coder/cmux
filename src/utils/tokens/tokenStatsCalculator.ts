/**
 * Shared token statistics calculation logic
 * Used by both frontend (ChatContext) and backend (debug commands)
 *
 * IMPORTANT: This utility is intentionally abstracted so that the debug command
 * (`bun debug costs`) has exact parity with the UI display in the Costs tab.
 * Any changes to token calculation logic should be made here to maintain consistency.
 */

import type { CmuxMessage } from "@/types/message";
import type { ChatStats, TokenConsumer } from "@/types/chatStats";
import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import { getTokenizerForModel, countTokensForData, getToolDefinitionTokens } from "./tokenizer";
import { getModelStats } from "./modelStats";

// Re-export types and functions from usageAggregator to maintain backward compatibility
// NOTE: CostsTab.tsx should import from usageAggregator.ts directly to avoid pulling tokenizer into renderer
export type { ChatUsageComponent, ChatUsageDisplay } from "./usageAggregator";
export { sumUsageHistory } from "./usageAggregator";

import type { ChatUsageDisplay } from "./usageAggregator";

/**
 * Create a display-friendly usage object from AI SDK usage
 */
export function createDisplayUsage(
  usage: LanguageModelV2Usage | undefined,
  model: string,
  providerMetadata?: Record<string, unknown>
): ChatUsageDisplay | undefined {
  if (!usage) return undefined;

  // Provider-specific token handling:
  // - OpenAI: inputTokens is INCLUSIVE of cachedInputTokens
  // - Anthropic: inputTokens EXCLUDES cachedInputTokens
  const cachedTokens = usage.cachedInputTokens ?? 0;
  const rawInputTokens = usage.inputTokens ?? 0;

  // Detect provider from model string
  const isOpenAI = model.startsWith("openai:");

  // For OpenAI, subtract cached tokens to get uncached input tokens
  const inputTokens = isOpenAI ? Math.max(0, rawInputTokens - cachedTokens) : rawInputTokens;

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

  // Calculate costs based on model stats (undefined if model unknown)
  let inputCost: number | undefined;
  let cachedCost: number | undefined;
  let cacheCreateCost: number | undefined;
  let outputCost: number | undefined;
  let reasoningCost: number | undefined;

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
 * @returns ChatStats with token breakdown by consumer and usage history
 */
export function calculateTokenStats(messages: CmuxMessage[], model: string): ChatStats {
  if (messages.length === 0) {
    return {
      consumers: [],
      totalTokens: 0,
      model,
      tokenizerName: "No messages",
      usageHistory: [],
    };
  }

  performance.mark("calculateTokenStatsStart");

  const tokenizer = getTokenizerForModel(model);
  const consumerMap = new Map<string, { fixed: number; variable: number }>();
  const toolsWithDefinitions = new Set<string>(); // Track which tools have definitions included
  const usageHistory: ChatUsageDisplay[] = [];
  let systemMessageTokens = 0; // Accumulate system message tokens across all requests

  // Calculate tokens by content producer (User, Assistant, individual tools)
  // This shows what activities are consuming tokens, useful for debugging costs
  for (const message of messages) {
    if (message.role === "user") {
      // User message text
      let userTokens = 0;
      for (const part of message.parts) {
        if (part.type === "text") {
          userTokens += tokenizer.countTokens(part.text);
        }
      }

      const existing = consumerMap.get("User") ?? { fixed: 0, variable: 0 };
      consumerMap.set("User", { fixed: 0, variable: existing.variable + userTokens });
    } else if (message.role === "assistant") {
      // Accumulate system message tokens from this request
      if (message.metadata?.systemMessageTokens) {
        systemMessageTokens += message.metadata.systemMessageTokens;
      }

      // Store usage in history for comparison with estimates
      if (message.metadata?.usage) {
        const usage = createDisplayUsage(
          message.metadata.usage,
          message.metadata.model ?? model, // Use actual model from request, not UI model
          message.metadata.providerMetadata
        );
        if (usage) {
          usageHistory.push(usage);
        }
      }

      // Count assistant text separately from tools
      // IMPORTANT: Batch tokenization by type to avoid calling tokenizer for each tiny part
      // (reasoning messages can have 600+ parts like "I", "'m", " thinking")

      // Group and concatenate parts by type
      const textParts = message.parts.filter((p) => p.type === "text");
      const reasoningParts = message.parts.filter((p) => p.type === "reasoning");

      // Tokenize text parts once (not per part!)
      if (textParts.length > 0) {
        const allText = textParts.map((p) => p.text).join("");
        const textTokens = tokenizer.countTokens(allText);
        const existing = consumerMap.get("Assistant") ?? { fixed: 0, variable: 0 };
        consumerMap.set("Assistant", { fixed: 0, variable: existing.variable + textTokens });
      }

      // Tokenize reasoning parts once (not per part!)
      if (reasoningParts.length > 0) {
        const allReasoning = reasoningParts.map((p) => p.text).join("");
        const reasoningTokens = tokenizer.countTokens(allReasoning);
        const existing = consumerMap.get("Reasoning") ?? { fixed: 0, variable: 0 };
        consumerMap.set("Reasoning", { fixed: 0, variable: existing.variable + reasoningTokens });
      }

      // Handle tool parts
      for (const part of message.parts) {
        if (part.type === "dynamic-tool") {
          // Count tool arguments
          const argsTokens = countTokensForData(part.input, tokenizer);

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
                resultTokens = countTokensForData(outputData, tokenizer);
              }
            } else {
              // Normal tool results
              resultTokens = countTokensForData(outputData, tokenizer);
            }
          }

          // Get existing or create new consumer for this tool
          const existing = consumerMap.get(part.toolName) ?? { fixed: 0, variable: 0 };

          // Add tool definition tokens if this is the first time we see this tool
          let fixedTokens = existing.fixed;
          if (!toolsWithDefinitions.has(part.toolName)) {
            fixedTokens += getToolDefinitionTokens(part.toolName, model);
            toolsWithDefinitions.add(part.toolName);
          }

          // Add variable tokens (args + results)
          const variableTokens = existing.variable + argsTokens + resultTokens;

          consumerMap.set(part.toolName, { fixed: fixedTokens, variable: variableTokens });
        }
      }
    }
  }

  // Add system message tokens as a consumer if present
  if (systemMessageTokens > 0) {
    consumerMap.set("System", { fixed: 0, variable: systemMessageTokens });
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
    usageHistory,
  };
}

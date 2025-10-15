/**
 * Usage aggregation utilities for cost calculation
 *
 * IMPORTANT: This file must NOT import tokenizer to avoid pulling
 * 2MB+ of encoding data into the renderer process.
 *
 * Separated from tokenStatsCalculator.ts to keep tokenizer in main process only.
 */

import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import type { CmuxMessage } from "@/types/message";
import { getModelStats } from "./modelStats";

export interface ChatUsageComponent {
  tokens: number;
  cost_usd?: number; // undefined if model pricing unknown
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
 * Sum multiple ChatUsageDisplay objects into a single cumulative display
 * Used for showing total costs across multiple API responses
 */
export function sumUsageHistory(usageHistory: ChatUsageDisplay[]): ChatUsageDisplay | undefined {
  if (usageHistory.length === 0) return undefined;

  // Track if any costs are undefined (model pricing unknown)
  let hasUndefinedCosts = false;

  const sum: ChatUsageDisplay = {
    input: { tokens: 0, cost_usd: 0 },
    cached: { tokens: 0, cost_usd: 0 },
    cacheCreate: { tokens: 0, cost_usd: 0 },
    output: { tokens: 0, cost_usd: 0 },
    reasoning: { tokens: 0, cost_usd: 0 },
  };

  for (const usage of usageHistory) {
    // Iterate over each component and sum tokens and costs
    for (const key of Object.keys(sum) as Array<keyof ChatUsageDisplay>) {
      sum[key].tokens += usage[key].tokens;
      if (usage[key].cost_usd === undefined) {
        hasUndefinedCosts = true;
      } else {
        sum[key].cost_usd = (sum[key].cost_usd ?? 0) + (usage[key].cost_usd ?? 0);
      }
    }
  }

  // If any costs were undefined, set all to undefined
  if (hasUndefinedCosts) {
    sum.input.cost_usd = undefined;
    sum.cached.cost_usd = undefined;
    sum.cacheCreate.cost_usd = undefined;
    sum.output.cost_usd = undefined;
    sum.reasoning.cost_usd = undefined;
  }

  return sum;
}

/**
 * Create a display-friendly usage object from AI SDK usage
 * Moved from tokenStatsCalculator.ts to be usable in renderer without tokenizer
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
 * Extract usage history from messages for display
 * Used by CostsTab to show API response data without expensive token calculation
 */
export function extractUsageHistory(messages: CmuxMessage[]): ChatUsageDisplay[] {
  const usageHistory: ChatUsageDisplay[] = [];

  for (const message of messages) {
    if (message.role === "assistant" && message.metadata?.usage) {
      const usage = createDisplayUsage(
        message.metadata.usage,
        message.metadata.model ?? "unknown",
        message.metadata.providerMetadata
      );
      if (usage) {
        usageHistory.push(usage);
      }
    }
  }

  return usageHistory;
}

/**
 * Frontend token consumer calculation - Pure functions for UI
 *
 * This module handles token consumer breakdown calculation in the frontend,
 * using the backend tokenization service for raw counts.
 *
 * Separation of concerns:
 * - Backend: Tokenization only (countTokens)
 * - Frontend: Display logic (aggregation, percentages, sorting)
 */

import type { CmuxMessage } from "@/types/message";
import type { TokenConsumer } from "@/types/chatStats";
import { getToolSchemas, getAvailableTools } from "@/utils/tools/toolDefinitions";

/**
 * Prepared tokenization data - all text that needs token counting
 */
export interface TokenizationData {
  /** All text content to tokenize (in order) */
  texts: string[];
  /** Maps token result index back to the consumer name */
  consumerMap: string[];
  /** Tool definitions that need to be counted */
  toolDefinitions: Map<string, string>; // toolName -> serialized definition
}

/**
 * Prepare all text for bulk tokenization
 * Pure function - no async, no IPC
 */
export function prepareTokenization(messages: CmuxMessage[], model: string): TokenizationData {
  const texts: string[] = [];
  const consumerMap: string[] = [];
  const toolDefinitions = new Map<string, string>();
  const seenTools = new Set<string>();

  // Get available tools for this model
  const availableTools = getAvailableTools(model);
  const toolSchemas = getToolSchemas();

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "text") {
        // User or Assistant text
        const consumerName = message.role === "user" ? "User" : "Assistant";
        texts.push(part.text);
        consumerMap.push(consumerName);
      } else if (part.type === "image") {
        // Images don't consume text tokens in our model
        continue;
      } else if (part.type === "reasoning") {
        // Reasoning content (extended thinking, etc.)
        texts.push(part.text);
        consumerMap.push("Assistant (reasoning)");
      } else if (part.type === "dynamic-tool") {
        // Tool call - args are variable tokens
        const toolName = part.toolName;
        texts.push(JSON.stringify(part.input));
        consumerMap.push(toolName);

        // Track tool definition (fixed overhead)
        if (!seenTools.has(toolName) && availableTools.includes(toolName)) {
          const schema = toolSchemas[toolName];
          if (schema) {
            toolDefinitions.set(toolName, JSON.stringify(schema));
            seenTools.add(toolName);
          }
        }

        // Tool result (if output is available) - variable tokens
        if (part.state === "output-available" && part.output !== undefined) {
          const resultText =
            typeof part.output === "string" ? part.output : JSON.stringify(part.output);
          texts.push(resultText);
          consumerMap.push(toolName);
        }
      }
    }
  }

  return { texts, consumerMap, toolDefinitions };
}

/**
 * Calculate token consumers from messages and token counts
 * Pure function - no async, no IPC
 */
export function calculateConsumers(
  tokenCounts: number[],
  consumerMap: string[],
  toolDefinitionCounts: Map<string, number>
): TokenConsumer[] {
  // Aggregate tokens by consumer
  const consumerTotals = new Map<string, { fixed: number; variable: number; total: number }>();

  // Add variable tokens from messages
  for (let i = 0; i < tokenCounts.length; i++) {
    const consumerName = consumerMap[i];
    const tokens = tokenCounts[i];

    if (!consumerTotals.has(consumerName)) {
      consumerTotals.set(consumerName, { fixed: 0, variable: 0, total: 0 });
    }

    const entry = consumerTotals.get(consumerName)!;
    entry.variable += tokens;
    entry.total += tokens;
  }

  // Add fixed tokens from tool definitions
  for (const [toolName, defTokens] of toolDefinitionCounts) {
    if (!consumerTotals.has(toolName)) {
      consumerTotals.set(toolName, { fixed: 0, variable: 0, total: 0 });
    }

    const entry = consumerTotals.get(toolName)!;
    entry.fixed += defTokens;
    entry.total += defTokens;
  }

  // Calculate total
  const totalTokens = Array.from(consumerTotals.values()).reduce(
    (sum, entry) => sum + entry.total,
    0
  );

  // Convert to TokenConsumer array with percentages
  const consumers: TokenConsumer[] = Array.from(consumerTotals.entries()).map(([name, entry]) => ({
    name,
    tokens: entry.total,
    percentage: totalTokens > 0 ? (entry.total / totalTokens) * 100 : 0,
    fixedTokens: entry.fixed > 0 ? entry.fixed : undefined,
    variableTokens: entry.variable > 0 ? entry.variable : undefined,
  }));

  // Sort descending by token count
  consumers.sort((a, b) => b.tokens - a.tokens);

  return consumers;
}

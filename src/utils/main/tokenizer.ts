/**
 * Token calculation utilities for chat statistics
 */

import AITokenizer, { type Encoding, models } from "ai-tokenizer";
import * as o200k_base from "ai-tokenizer/encoding/o200k_base";
import * as claude from "ai-tokenizer/encoding/claude";
import { LRUCache } from "lru-cache";
import CRC32 from "crc-32";
import { getToolSchemas, getAvailableTools } from "@/utils/tools/toolDefinitions";

export interface Tokenizer {
  name: string;
  countTokens: (text: string) => number;
}

/**
 * LRU cache for token counts by text checksum
 * Avoids re-tokenizing identical strings (system messages, tool definitions, etc.)
 * Key: CRC32 checksum of text, Value: token count
 */
const tokenCountCache = new LRUCache<number, number>({
  max: 500000, // Max entries (safety limit)
  maxSize: 16 * 1024 * 1024, // 16MB total cache size
  sizeCalculation: () => {
    // Each entry: ~8 bytes (key) + ~8 bytes (value) + ~32 bytes (LRU overhead) ≈ 48 bytes
    return 48;
  },
});

/**
 * Count tokens with caching via CRC32 checksum
 * Avoids re-tokenizing identical strings (system messages, tool definitions, etc.)
 *
 * NOTE: For async tokenization, this returns an approximation immediately and caches
 * the accurate count in the background. Subsequent calls will use the cached accurate count.
 */
function countTokensCached(text: string, tokenizeFn: () => number | Promise<number>): number {
  const checksum = CRC32.str(text);
  const cached = tokenCountCache.get(checksum);
  if (cached !== undefined) {
    return cached;
  }

  const result = tokenizeFn();

  // Synchronous case: cache and return immediately
  if (typeof result === "number") {
    tokenCountCache.set(checksum, result);
    return result;
  }

  // Async case: return approximation now, cache accurate value when ready
  const approximation = Math.ceil(text.length / 4);
  void result.then((count) => tokenCountCache.set(checksum, count));
  return approximation;
}

/**
 * Get the appropriate tokenizer for a given model string
 *
 * @param modelString - Model identifier (e.g., "anthropic:claude-opus-4-1", "openai:gpt-4")
 * @returns Tokenizer interface with name and countTokens function
 */
export function getTokenizerForModel(modelString: string): Tokenizer {
  const [provider, modelId] = modelString.split(":");
  let model = models[`${provider}/${modelId}` as keyof typeof models];
  let hasExactTokenizer = true;
  if (!model) {
    switch (modelString) {
      case "anthropic:claude-sonnet-4-5":
        model = models["anthropic/claude-sonnet-4.5"];
        break;
      default:
        // GPT-4o has pretty good approximation for most models.
        model = models["openai/gpt-4o"];
        hasExactTokenizer = false;
    }
  }

  let encoding: Encoding;
  switch (model.encoding) {
    case "o200k_base":
      encoding = o200k_base;
      break;
    case "claude":
      encoding = claude;
      break;
    default:
      // Do not include all encodings, as they are pretty big.
      // The most common one is o200k_base.
      encoding = o200k_base;
      break;
  }
  const tokenizer = new AITokenizer(encoding);

  return {
    get name() {
      return hasExactTokenizer ? model.encoding : "approximation";
    },
    countTokens: (text: string) => {
      return countTokensCached(text, () => {
        try {
          return tokenizer.count(text);
        } catch (error) {
          // Unexpected error during tokenization, fallback to approximation
          console.error("Failed to tokenize with tiktoken, falling back to approximation:", error);
          return Math.ceil(text.length / 4);
        }
      });
    },
  };
}

/**
 * Calculate token counts for serialized data (tool args/results)
 */
export function countTokensForData(data: unknown, tokenizer: Tokenizer): number {
  const serialized = JSON.stringify(data);
  return tokenizer.countTokens(serialized);
}

/**
 * Get estimated token count for tool definitions
 * These are the schemas sent to the API for each tool
 *
 * @param toolName The name of the tool (bash, file_read, web_search, etc.)
 * @param modelString The model string to get accurate tool definitions
 * @returns Estimated token count for the tool definition
 */
export function getToolDefinitionTokens(toolName: string, modelString: string): number {
  try {
    // Check if this tool is available for this model
    const availableTools = getAvailableTools(modelString);
    if (!availableTools.includes(toolName)) {
      // Tool not available for this model
      return 0;
    }

    // Get the tool schema
    const toolSchemas = getToolSchemas();
    const toolSchema = toolSchemas[toolName];

    if (!toolSchema) {
      // Tool not found, return a default estimate
      return 40;
    }

    // Serialize the tool definition to estimate tokens
    const serialized = JSON.stringify(toolSchema);
    const tokenizer = getTokenizerForModel(modelString);
    return tokenizer.countTokens(serialized);
  } catch {
    // Fallback to estimates if we can't get the actual definition
    const fallbackSizes: Record<string, number> = {
      bash: 65,
      file_read: 45,
      file_edit_replace: 70,
      file_edit_insert: 50,
      web_search: 50,
      google_search: 50,
    };
    return fallbackSizes[toolName] || 40;
  }
}

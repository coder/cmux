/**
 * Token calculation utilities for chat statistics
 */

import type { Tiktoken } from "@dqbd/tiktoken";
import { LRUCache } from "lru-cache";
import CRC32 from "crc-32";
import { getToolSchemas, getAvailableTools } from "@/utils/tools/toolDefinitions";

export interface Tokenizer {
  name: string;
  countTokens: (text: string) => number;
}

/**
 * Module-level cache for tiktoken encoders
 * Encoders are expensive to construct, so we cache and reuse them
 */
const tiktokenEncoderCache = new Map<string, Tiktoken>();

/**
 * Tracks if tiktoken module load has failed
 * Prevents repeated failed import attempts in browser contexts
 */
let tiktokenLoadFailed = false;

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
 * Detect if we're in a browser/renderer context vs Node.js main process
 * Returns true for Electron renderer/worker, false for Electron main process or pure Node.js
 *
 * We skip tiktoken in browser contexts because WASM initialization causes errors in production builds.
 */
function isBrowserContext(): boolean {
  // Check for Electron process type (only available in Electron environments)
  const processType = (globalThis as { process?: NodeJS.Process & { type?: string } }).process
    ?.type;

  // Electron main process has type 'browser' or undefined
  // Electron renderer has type 'renderer'
  // Web workers have type 'worker'
  if (processType !== undefined) {
    return processType === "renderer" || processType === "worker";
  }

  // Not in Electron - use window as fallback indicator
  return typeof window !== "undefined";
}

/**
 * Get or create a cached tiktoken encoder for a given OpenAI model
 * This implements lazy initialization - encoder is only created on first use
 * Returns null if initialization fails (e.g., WASM not ready in packaged app)
 */
async function getOrCreateTiktokenEncoder(modelName: "gpt-4o"): Promise<Tiktoken | null> {
  // Skip tiktoken in browser/renderer contexts - use approximation instead
  // This prevents WASM initialization errors in Electron renderer process
  if (isBrowserContext()) {
    if (!tiktokenLoadFailed) {
      console.log(
        "Skipping tiktoken in browser context - using approximation (this is normal and expected)"
      );
      tiktokenLoadFailed = true;
    }
    return null;
  }

  // If we already failed to load, don't try again
  if (tiktokenLoadFailed) {
    return null;
  }

  if (!tiktokenEncoderCache.has(modelName)) {
    try {
      // Dynamic import required: Prevents WASM initialization during module load which causes
      // "Cannot set properties of undefined (setting 'prototype')" in packaged Electron apps.
      // This is an acceptable use of dynamic import as it's a workaround for WASM/Electron incompatibility.
      // eslint-disable-next-line no-restricted-syntax
      const { encoding_for_model } = await import("@dqbd/tiktoken");
      const encoder = encoding_for_model(modelName);
      tiktokenEncoderCache.set(modelName, encoder);
    } catch (error) {
      console.warn("Failed to initialize tiktoken encoder:", error);
      tiktokenLoadFailed = true;
      return null;
    }
  }
  return tiktokenEncoderCache.get(modelName) ?? null;
}

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
export function getTokenizerForModel(_modelString: string): Tokenizer {
  // Use GPT-4o tokenizer for Anthropic models - better approximation than char count
  // Note: Not 100% accurate for Claude 3+, but close enough for cost estimation

  // Defer encoder initialization until first use - critical for packaged Electron apps
  // where WASM loads asynchronously. Initializing during module import causes
  // "Cannot set properties of undefined (setting 'prototype')" errors.
  let encoder: Tiktoken | null | undefined = undefined; // undefined = not yet attempted
  let tokenizerName = "tiktoken"; // Optimistic default

  return {
    get name() {
      // Lazy evaluation of name - reflects actual initialization state
      if (encoder === undefined) {
        // Haven't tried to initialize yet, return optimistic name
        return tokenizerName;
      }
      return encoder === null ? "approximation" : "tiktoken";
    },
    countTokens: (text: string) => {
      return countTokensCached(text, async () => {
        // Lazy initialization on first use
        if (encoder === undefined) {
          encoder = await getOrCreateTiktokenEncoder("gpt-4o");
          tokenizerName = encoder === null ? "approximation" : "tiktoken";
        }

        if (encoder === null) {
          // WASM not available (common in packaged apps), use approximation
          return Math.ceil(text.length / 4);
        }

        try {
          // Use o200k_base encoding for GPT-4o and newer models (GPT-5, o1, etc.)
          // Encoder is cached and reused for performance
          const tokens = encoder.encode(text);
          return tokens.length;
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

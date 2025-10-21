/**
 * Token calculation utilities for chat statistics
 */

import { LRUCache } from "lru-cache";
import CRC32 from "crc-32";
import { getToolSchemas, getAvailableTools } from "@/utils/tools/toolDefinitions";
import * as o200k_base_encoding from "ai-tokenizer/encoding/o200k_base";
import * as claude_encoding from "ai-tokenizer/encoding/claude";

export interface Tokenizer {
  encoding: string;
  countTokens: (text: string) => number;
}

/**
 * Lazy-loaded tokenizer modules to reduce startup time
 * These are loaded on first use with /4 approximation fallback
 *
 * eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Dynamic imports are intentional for lazy loading
 */
interface TokenizerModuleImports {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  AITokenizer: typeof import("ai-tokenizer").default;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  models: typeof import("ai-tokenizer").models;
}

let tokenizerModules: TokenizerModuleImports | null = null;

let tokenizerLoadPromise: Promise<void> | null = null;

// Cache for loaded encodings (loaded on-demand)
const loadedEncodings = new Map<string, unknown>();

/**
 * Load tokenizer modules asynchronously
 * Dynamic imports are intentional here to defer loading heavy tokenizer modules
 * until first use, reducing app startup time from ~8.8s to <1s
 *
 * @returns Promise that resolves when tokenizer modules are loaded
 */
export async function loadTokenizerModules(): Promise<void> {
  if (tokenizerModules) return;
  if (tokenizerLoadPromise) return tokenizerLoadPromise;

  tokenizerLoadPromise = (async () => {
    // Performance: lazy load tokenizer modules to reduce startup time from ~8.8s to <1s
    /* eslint-disable no-restricted-syntax */
    const [AITokenizerModule, modelsModule] = await Promise.all([
      import("ai-tokenizer"),
      import("ai-tokenizer"),
    ]);
    /* eslint-enable no-restricted-syntax */

    tokenizerModules = {
      AITokenizer: AITokenizerModule.default,
      models: modelsModule.models,
    };
  })();

  return tokenizerLoadPromise;
}

/**
 * Get encoding module (pre-loaded at startup)
 * Returns the appropriate encoding for the given name
 */
function getEncoding(encodingName: string): unknown {
  const cached = loadedEncodings.get(encodingName);
  if (cached) return cached;

  const encoding = encodingName === "claude" ? claude_encoding : o200k_base_encoding;
  loadedEncodings.set(encodingName, encoding);
  return encoding;
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

type TokenizerModules = TokenizerModuleImports;
type TokenizerModelRecord = Record<string, { encoding: string } | undefined>;

const FALLBACK_MODEL_KEY = "openai/gpt-4o";
const FALLBACK_ENCODING = "o200k_base";

const MODEL_KEY_OVERRIDES: Record<string, string> = {
  "anthropic:claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
};

function normalizeModelKey(modelString: string): string {
  return modelString.includes(":") ? modelString.replace(":", "/") : modelString;
}

function getTokenizerModels(modules: TokenizerModules): TokenizerModelRecord {
  return modules.models as TokenizerModelRecord;
}

function resolveTokenizerEncoding(modelString: string, modules: TokenizerModules): string {
  const models = getTokenizerModels(modules);

  const candidates: Array<string | undefined> = [];
  if (modelString.includes("/")) {
    candidates.push(modelString);
  }
  if (modelString.includes(":")) {
    candidates.push(normalizeModelKey(modelString));
  }
  candidates.push(MODEL_KEY_OVERRIDES[modelString]);

  for (const key of candidates) {
    if (!key) continue;
    const entry = models[key];
    if (entry?.encoding) {
      return entry.encoding;
    }
  }

  return models[FALLBACK_MODEL_KEY]?.encoding ?? FALLBACK_ENCODING;
}

function getTokenizerEncoding(modelString: string, modules: TokenizerModules | null): string {
  if (!modules) {
    return normalizeModelKey(modelString);
  }

  return resolveTokenizerEncoding(modelString, modules);
}

/**
 * Count tokens using loaded tokenizer modules
 * Assumes tokenizerModules is not null
 */
function countTokensWithLoadedModules(
  text: string,
  modelString: string,
  modules: NonNullable<typeof tokenizerModules>
): number {
  const encodingName = getTokenizerEncoding(modelString, modules);

  const encoding = getEncoding(encodingName);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  const tokenizer = new modules.AITokenizer(encoding as any);
  return tokenizer.count(text);
}

/**
 * Get the appropriate tokenizer for a given model string
 *
 * @param modelString - Model identifier (e.g., "anthropic:claude-opus-4-1", "openai:gpt-4")
 * @returns Tokenizer interface with name and countTokens function
 */
export function getTokenizerForModel(modelString: string): Tokenizer {
  // Start loading tokenizer modules in background (idempotent)
  void loadTokenizerModules();

  return {
    get encoding() {
      return getTokenizerEncoding(modelString, tokenizerModules);
    },
    countTokens: (text: string) => {
      // Try synchronous path if modules are already loaded
      if (tokenizerModules) {
        try {
          return countTokensCached(text, () => countTokensWithLoadedModules(text, modelString, tokenizerModules!));
        } catch (error) {
          // Unexpected error during tokenization, fallback to approximation
          console.error("Failed to tokenize, falling back to approximation:", error);
          return Math.ceil(text.length / 4);
        }
      }

      // Fallback to async path for first-time loading
      return countTokensCached(text, async () => {
        await loadTokenizerModules();
        try {
          return countTokensWithLoadedModules(text, modelString, tokenizerModules!);
        } catch (error) {
          // Unexpected error during tokenization, fallback to approximation
          console.error("Failed to tokenize, falling back to approximation:", error);
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
      file_edit_replace_string: 70,
      file_edit_replace_lines: 80,
      file_edit_insert: 50,
      web_search: 50,
      google_search: 50,
    };
    return fallbackSizes[toolName] || 40;
  }
}

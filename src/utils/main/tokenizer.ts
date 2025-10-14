/**
 * Token calculation utilities for chat statistics
 */

import { LRUCache } from "lru-cache";
import CRC32 from "crc-32";
import { getToolSchemas, getAvailableTools } from "@/utils/tools/toolDefinitions";

export interface Tokenizer {
  name: string;
  countTokens: (text: string) => number;
}

/**
 * Lazy-loaded tokenizer modules to reduce startup time
 * These are loaded on first use with /4 approximation fallback
 *
 * eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Dynamic imports are intentional for lazy loading
 */
type TokenizerModuleImports = {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  AITokenizer: typeof import("ai-tokenizer").default;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  models: typeof import("ai-tokenizer").models;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  o200k_base: typeof import("ai-tokenizer/encoding/o200k_base");
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  claude: typeof import("ai-tokenizer/encoding/claude");
};

let tokenizerModules: TokenizerModuleImports | null = null;

let tokenizerLoadPromise: Promise<void> | null = null;

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
    const [AITokenizerModule, modelsModule, o200k_base, claude] = await Promise.all([
      import("ai-tokenizer"),
      import("ai-tokenizer"),
      import("ai-tokenizer/encoding/o200k_base"),
      import("ai-tokenizer/encoding/claude"),
    ]);
    /* eslint-enable no-restricted-syntax */

    tokenizerModules = {
      AITokenizer: AITokenizerModule.default,
      models: modelsModule.models,
      o200k_base,
      claude,
    };
  })();

  return tokenizerLoadPromise;
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

interface TokenizerModelInfo {
  name: string;
  encoding: string;
  [key: string]: unknown;
}

type TokenizerModules = TokenizerModuleImports;
type TokenizerModelRecord = Record<string, TokenizerModelInfo>;

const FALLBACK_MODEL_KEY = "openai/gpt-4o";
const FALLBACK_MODEL_INFO: TokenizerModelInfo = {
  name: "GPT-4o",
  encoding: "o200k_base",
};

const MODEL_KEY_OVERRIDES: Record<string, string> = {
  "anthropic:claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
};

function normalizeModelKey(modelString: string): string {
  return modelString.includes(":") ? modelString.replace(":", "/") : modelString;
}

function getTokenizerModels(modules: TokenizerModules): TokenizerModelRecord {
  return modules.models as TokenizerModelRecord;
}

function resolveTokenizerModel(
  modelString: string,
  modules: TokenizerModules
): { key: string; model: TokenizerModelInfo } {
  const models = getTokenizerModels(modules);

  const candidates: Array<string | undefined> = [];
  if (modelString.includes("/")) {
    candidates.push(modelString);
  }
  if (modelString.includes(":")) {
    candidates.push(normalizeModelKey(modelString));
  }
  candidates.push(MODEL_KEY_OVERRIDES[modelString]);
  candidates.push(FALLBACK_MODEL_KEY);

  for (const key of candidates) {
    if (!key) continue;
    const model = models[key];
    if (model) {
      return { key, model };
    }
  }

  return { key: FALLBACK_MODEL_KEY, model: FALLBACK_MODEL_INFO };
}

function formatApproximationName(modelString: string): string {
  return normalizeModelKey(modelString);
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
  const { model } = resolveTokenizerModel(modelString, modules);

  let encoding: typeof modules.o200k_base | typeof modules.claude;
  switch (model.encoding) {
    case "o200k_base":
      encoding = modules.o200k_base;
      break;
    case "claude":
      encoding = modules.claude;
      break;
    default:
      // Do not include all encodings, as they are pretty big.
      // The most common one is o200k_base.
      encoding = modules.o200k_base;
      break;
  }
  const tokenizer = new modules.AITokenizer(encoding);
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
    get name() {
      if (tokenizerModules) {
        const { key, model } = resolveTokenizerModel(modelString, tokenizerModules);
        return `${model.name} (${key})`;
      }

      return `${formatApproximationName(modelString)} (estimated)`;
    },
    countTokens: (text: string) => {
      // If tokenizer already loaded, use synchronous path for accurate counts
      if (tokenizerModules) {
        return countTokensCached(text, () => {
          try {
            return countTokensWithLoadedModules(text, modelString, tokenizerModules!);
          } catch (error) {
            // Unexpected error during tokenization, fallback to approximation
            console.error("Failed to tokenize, falling back to approximation:", error);
            return Math.ceil(text.length / 4);
          }
        });
      }

      // Tokenizer not yet loaded - use async path (returns approximation immediately)
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

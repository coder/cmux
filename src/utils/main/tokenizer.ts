/**
 * Token calculation utilities for chat statistics
 */

import assert from "@/utils/assert";
import { LRUCache } from "lru-cache";
import CRC32 from "crc-32";
import { getToolSchemas, getAvailableTools } from "@/utils/tools/toolDefinitions";

export interface Tokenizer {
  encoding: string;
  countTokens: (text: string) => number;
}

interface TokenizerBaseModules {
  // Base module properties (always required)
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  AITokenizer: typeof import("ai-tokenizer").default;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  models: typeof import("ai-tokenizer").models;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type EncodingModule = import("ai-tokenizer").Encoding;

type TokenizerModuleValue =
  | EncodingModule
  | TokenizerBaseModules[keyof TokenizerBaseModules]
  | undefined;

interface TokenizerModuleImports
  extends TokenizerBaseModules,
    Record<string, TokenizerModuleValue> {}

const KNOWN_ENCODINGS = ["o200k_base", "claude"] as const;

/**
 * Module cache - stores loaded modules
 */
const moduleCache: {
  base: TokenizerBaseModules | null;
  encodings: Map<string, EncodingModule>;
} = {
  base: null,
  encodings: new Map<string, EncodingModule>(),
};

type TokenizerReadyListener = () => void;
const readyListeners = new Set<TokenizerReadyListener>();
let tokenizerModulesReady = false;

type TokenizerEncodingListener = (encodingName: string) => void;
const encodingListeners = new Set<TokenizerEncodingListener>();

function hasAllKnownEncodingsLoaded(): boolean {
  if (!moduleCache.base) {
    return false;
  }
  for (const encoding of KNOWN_ENCODINGS) {
    if (!moduleCache.encodings.has(encoding)) {
      return false;
    }
  }
  return true;
}

function notifyIfTokenizerReady(): void {
  if (tokenizerModulesReady) {
    return;
  }
  if (hasAllKnownEncodingsLoaded()) {
    tokenizerModulesReady = true;
    for (const listener of readyListeners) {
      try {
        listener();
      } catch (error) {
        console.error("[tokenizer] Ready listener threw:", error);
      }
    }
    readyListeners.clear();
  }
}

function notifyEncodingLoaded(encodingName: string): void {
  assert(
    encodingName.length > 0,
    "Tokenizer encoding notification requires non-empty encoding name"
  );
  if (encodingListeners.size === 0) {
    return;
  }
  for (const listener of encodingListeners) {
    try {
      listener(encodingName);
    } catch (error) {
      console.error(`[tokenizer] Encoding listener threw for '${encodingName}':`, error);
    }
  }
}

export function onTokenizerModulesLoaded(listener: () => void): () => void {
  if (tokenizerModulesReady || hasAllKnownEncodingsLoaded()) {
    tokenizerModulesReady = true;
    listener();
    return () => undefined;
  }

  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
  };
}

export function onTokenizerEncodingLoaded(listener: TokenizerEncodingListener): () => void {
  assert(typeof listener === "function", "Tokenizer encoding listener must be a function");
  encodingListeners.add(listener);

  // Immediately notify about already-loaded encodings so listeners can catch up.
  for (const encodingName of moduleCache.encodings.keys()) {
    try {
      listener(encodingName);
    } catch (error) {
      console.error(
        `[tokenizer] Encoding listener threw for '${encodingName}' during initial replay:`,
        error
      );
    }
  }

  return () => {
    encodingListeners.delete(listener);
  };
}

function normalizeEncodingModule(
  encodingName: string,
  module: Record<string, unknown>
): EncodingModule {
  const candidate = module as Partial<EncodingModule>;

  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    throw new Error(`Tokenizer encoding '${encodingName}' module missing name field`);
  }

  if (candidate.name !== encodingName) {
    throw new Error(
      `Tokenizer encoding loader mismatch: expected '${encodingName}' but received '${String(candidate.name)}'`
    );
  }

  if (
    typeof candidate.pat_str !== "string" ||
    typeof candidate.special_tokens !== "object" ||
    candidate.special_tokens === null ||
    typeof candidate.stringEncoder !== "object" ||
    candidate.stringEncoder === null ||
    !Array.isArray(candidate.binaryEncoder) ||
    typeof candidate.decoder !== "object" ||
    candidate.decoder === null
  ) {
    throw new Error(`Tokenizer encoding '${encodingName}' module missing required fields`);
  }

  return {
    name: candidate.name,
    pat_str: candidate.pat_str,
    special_tokens: candidate.special_tokens,
    stringEncoder: candidate.stringEncoder,
    binaryEncoder: candidate.binaryEncoder,
    decoder: candidate.decoder,
  };
}

const ENCODING_LOADERS: Record<string, () => Promise<EncodingModule>> = {
  /* eslint-disable no-restricted-syntax */
  o200k_base: async () =>
    normalizeEncodingModule("o200k_base", await import("ai-tokenizer/encoding/o200k_base")),
  claude: async () =>
    normalizeEncodingModule("claude", await import("ai-tokenizer/encoding/claude")),
  cl100k_base: async () =>
    normalizeEncodingModule("cl100k_base", await import("ai-tokenizer/encoding/cl100k_base")),
  p50k_base: async () =>
    normalizeEncodingModule("p50k_base", await import("ai-tokenizer/encoding/p50k_base")),
  /* eslint-enable no-restricted-syntax */
};

/**
 * Loading promises - prevents duplicate concurrent imports
 */
const loadingPromises = {
  base: null as Promise<void> | null,
  encodings: new Map<string, Promise<void>>(),
};

/**
 * Set of base module property names
 */
const BASE_MODULE_PROPS = new Set(["AITokenizer", "models"]);

/**
 * Start loading base ai-tokenizer module (AITokenizer, models)
 * Idempotent - safe to call multiple times
 */
function startLoadingBase(): void {
  if (moduleCache.base || loadingPromises.base) return;

  console.time("[tokenizer] load base module");
  loadingPromises.base = (async () => {
    /* eslint-disable no-restricted-syntax */
    const module = await import("ai-tokenizer");
    /* eslint-enable no-restricted-syntax */
    moduleCache.base = {
      AITokenizer: module.default,
      models: module.models,
    };
    console.timeEnd("[tokenizer] load base module");
    notifyIfTokenizerReady();
  })();
}

/**
 * Start loading a specific encoding module
 * Generic - works for any encoding name (o200k_base, claude, gemini, etc.)
 *
 * @param encodingName - Name of the encoding to load
 */
function startLoadingEncoding(encodingName: string): void {
  if (!encodingName) {
    throw new Error("Tokenizer encoding name must be non-empty");
  }

  if (moduleCache.encodings.has(encodingName) || loadingPromises.encodings.has(encodingName)) {
    return;
  }

  const loader = ENCODING_LOADERS[encodingName];
  if (!loader) {
    console.warn(`[tokenizer] Unsupported encoding requested: ${encodingName}`);
    return;
  }

  const timerLabel = `[tokenizer] load encoding: ${encodingName}`;
  console.time(timerLabel);
  const promise = (async () => {
    try {
      const module = await loader();
      moduleCache.encodings.set(encodingName, module);
      notifyIfTokenizerReady();
      notifyEncodingLoaded(encodingName);
    } catch (error) {
      console.error(`Failed to load tokenizer encoding '${encodingName}':`, error);
    } finally {
      console.timeEnd(timerLabel);
      if (loadingPromises.encodings.has(encodingName)) {
        loadingPromises.encodings.delete(encodingName);
      }
    }
  })();

  loadingPromises.encodings.set(encodingName, promise);
}

/**
 * Proxy that loads tokenizer modules on-demand
 * - Accessing AITokenizer/models → loads base module
 * - Accessing any other property → loads encoding with that name
 */
const tokenizerModules: TokenizerModuleImports = new Proxy({} as TokenizerModuleImports, {
  get(_target, prop: string) {
    // Base module properties
    if (BASE_MODULE_PROPS.has(prop)) {
      startLoadingBase();
      return moduleCache.base?.[prop as keyof typeof moduleCache.base];
    }

    // Everything else is an encoding (o200k_base, claude, etc.)
    startLoadingEncoding(prop);
    return moduleCache.encodings.get(prop);
  },
});

// Track if loadTokenizerModules() is already in progress
let eagerLoadPromise: Promise<void> | null = null;

/**
 * Load tokenizer modules asynchronously (eager mode - loads all known encodings)
 * Dynamic imports are intentional here to defer loading heavy tokenizer modules
 * until first use, reducing app startup time from ~8.8s to <1s
 *
 * Idempotent - safe to call multiple times
 *
 * @returns Promise that resolves when tokenizer modules are loaded
 */
export async function loadTokenizerModules(): Promise<void> {
  // Check if already loaded
  const allLoaded =
    moduleCache.base && KNOWN_ENCODINGS.every((enc) => moduleCache.encodings.has(enc));

  if (allLoaded) {
    // console.log("[tokenizer] All modules already loaded, returning early");
    return;
  }

  // Check if already loading
  if (eagerLoadPromise) {
    return eagerLoadPromise;
  }

  console.log("[tokenizer] loadTokenizerModules() called");
  console.time("[tokenizer] loadTokenizerModules() total");

  // Start the load and cache the promise
  eagerLoadPromise = (async () => {
    // Trigger all loads
    console.log("[tokenizer] Starting loads for base + encodings:", KNOWN_ENCODINGS);
    startLoadingBase();
    KNOWN_ENCODINGS.forEach((enc) => startLoadingEncoding(enc));

    // Wait for all to complete
    console.log("[tokenizer] Waiting for all loads to complete...");
    await Promise.all(
      [
        loadingPromises.base,
        ...KNOWN_ENCODINGS.map((enc) => loadingPromises.encodings.get(enc)),
      ].filter(Boolean) as Array<Promise<void>>
    );

    console.timeEnd("[tokenizer] loadTokenizerModules() total");
    console.log("[tokenizer] All modules loaded successfully");
    notifyIfTokenizerReady();
  })();

  return eagerLoadPromise;
}

/**
 * Load only the tokenizer modules needed for a specific model
 * More efficient than loadTokenizerModules() if you know the model upfront
 *
 * This loads ~50% faster than loadTokenizerModules() since it only loads
 * the base module + one encoding instead of all encodings.
 *
 * @param modelString - Model identifier (e.g., "anthropic:claude-opus-4-1", "openai:gpt-4")
 */
export async function loadTokenizerForModel(modelString: string): Promise<void> {
  // Start loading base module
  startLoadingBase();
  if (loadingPromises.base) {
    await loadingPromises.base;
  }

  const baseModules = moduleCache.base;
  assert(baseModules, "Tokenizer base modules must be loaded before selecting encodings");

  // Determine which encoding we need
  const encodingName = getTokenizerEncoding(modelString, baseModules);

  // Load only that encoding
  startLoadingEncoding(encodingName);
  const promise = loadingPromises.encodings.get(encodingName);
  if (promise) {
    await promise;
  }
  notifyIfTokenizerReady();
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

interface TokenCountCacheEntry {
  value: number;
  cache: boolean;
}

type TokenCountResult = number | TokenCountCacheEntry;

function normalizeTokenCountResult(result: TokenCountResult): TokenCountCacheEntry {
  if (typeof result === "number") {
    assert(Number.isFinite(result), "Token count must be a finite number");
    assert(result >= 0, "Token count cannot be negative");
    return { value: result, cache: true };
  }

  assert(Number.isFinite(result.value), "Token count must be a finite number");
  assert(result.value >= 0, "Token count cannot be negative");
  assert(typeof result.cache === "boolean", "Token count cache flag must be boolean");
  return result;
}

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in (value as Record<string, unknown>) &&
    typeof (value as PromiseLike<T>).then === "function"
  );
}

function fallbackTokenCount(text: string): TokenCountCacheEntry {
  const approximation = Math.ceil(text.length / 4);
  assert(Number.isFinite(approximation), "Token count approximation must be finite");
  return { value: approximation, cache: false };
}

/**
 * Count tokens with caching via CRC32 checksum
 * Avoids re-tokenizing identical strings (system messages, tool definitions, etc.)
 *
 * NOTE: For async tokenization, this returns an approximation immediately and caches
 * the accurate count in the background. Subsequent calls will use the cached accurate count.
 */
function countTokensCached(
  text: string,
  tokenizeFn: () => TokenCountResult | Promise<TokenCountResult>
): number {
  const checksum = CRC32.str(text);
  const cached = tokenCountCache.get(checksum);
  if (cached !== undefined) {
    return cached;
  }

  const result = tokenizeFn();

  if (!isPromiseLike<TokenCountResult>(result)) {
    const normalized = normalizeTokenCountResult(result);
    if (normalized.cache) {
      tokenCountCache.set(checksum, normalized.value);
    }
    return normalized.value;
  }

  // Async case: return approximation now, cache accurate value when ready
  const approximation = Math.ceil(text.length / 4);
  void result
    .then((resolved) => {
      const normalized = normalizeTokenCountResult(resolved);
      if (normalized.cache) {
        tokenCountCache.set(checksum, normalized.value);
      }
    })
    .catch((error) => {
      console.error("[tokenizer] Async tokenization failed", error);
    });
  return approximation;
}

type TokenizerModules = TokenizerBaseModules;
type TokenizerModelRecord = Record<string, { encoding: string } | undefined>;

const FALLBACK_MODEL_KEY = "openai/gpt-4o";
const FALLBACK_ENCODING = "o200k_base";
const TOKENIZATION_FALLBACK_MESSAGE =
  "[tokenizer] Failed to tokenize with loaded modules; returning fallback approximation";

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
 * Assumes base module is loaded; encoding will be loaded on-demand via Proxy if needed
 */
function countTokensWithLoadedModules(
  text: string,
  modelString: string,
  modules: TokenizerModuleImports
): number {
  if (!moduleCache.base) {
    throw new Error("Tokenizer base modules not loaded");
  }

  const encodingName = getTokenizerEncoding(modelString, moduleCache.base);
  startLoadingEncoding(encodingName);

  const encoding = moduleCache.encodings.get(encodingName);
  if (!encoding) {
    throw new Error(`Encoding '${encodingName}' not loaded yet`);
  }

  const { AITokenizer } = modules;
  if (!AITokenizer) {
    throw new Error("Tokenizer base constructor not loaded");
  }

  const tokenizer = new AITokenizer(encoding);
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
      return getTokenizerEncoding(modelString, moduleCache.base);
    },
    countTokens: (text: string) => {
      // If tokenizer base module already loaded, use synchronous path for accurate counts
      // The Proxy will trigger encoding load on-demand if not already loaded
      if (moduleCache.base) {
        return countTokensCached(text, () => {
          try {
            return countTokensWithLoadedModules(text, modelString, tokenizerModules);
          } catch (error) {
            console.error(TOKENIZATION_FALLBACK_MESSAGE, error);
            return fallbackTokenCount(text);
          }
        });
      }

      // Tokenizer not yet loaded - use async path (returns approximation immediately)
      return countTokensCached(text, async () => {
        await loadTokenizerModules();
        try {
          return countTokensWithLoadedModules(text, modelString, tokenizerModules);
        } catch (error) {
          console.error(TOKENIZATION_FALLBACK_MESSAGE, error);
          return fallbackTokenCount(text);
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

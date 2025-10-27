/**
 * Token calculation utilities for chat statistics
 */
import { assert } from "@/utils/assert";
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

const BASE_MODULE_PROPS = ["AITokenizer", "models"] as const satisfies ReadonlyArray<
  keyof TokenizerBaseModules
>;

const KNOWN_ENCODINGS = ["o200k_base", "claude"] as const;

/**
 * Dynamic imports below are deliberate to keep ~2MB encoding bundles out of the initial
 * startup path. See eslint.config.mjs for the scoped override that documents this policy.
 */

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

let baseLoadPromise: Promise<TokenizerBaseModules> | null = null;
const encodingLoadPromises = new Map<string, Promise<EncodingModule>>();

type TokenizerReadyListener = () => void;
const readyListeners = new Set<TokenizerReadyListener>();
let tokenizerModulesReady = false;

type TokenizerEncodingListener = (encodingName: string) => void;
const encodingListeners = new Set<TokenizerEncodingListener>();

function isTokenizerReady(): boolean {
  return moduleCache.base !== null && moduleCache.encodings.size > 0;
}

function now(): number {
  const perf = globalThis.performance;
  if (perf && typeof perf.now === "function") {
    return perf.now.call(perf);
  }
  return Date.now();
}

interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

const consoleLogger: Logger = {
  info: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
  debug: (...args) => {
    if (typeof process !== "undefined" && process.env?.CMUX_DEBUG) {
      console.debug(...args);
    }
  },
};

let activeLogger: Logger = consoleLogger;

// Lazy-import log.ts in the Electron main process only to keep renderer bundles small.
if (typeof process !== "undefined" && process.type === "browser") {
  void import("@/services/log")
    .then((module) => {
      activeLogger = module.log;
    })
    .catch(() => {
      // Fallback to console logging when log.ts is unavailable (tests, worker builds).
    });
}

const logger: Logger = {
  info: (...args) => activeLogger.info(...args),
  error: (...args) => activeLogger.error(...args),
  debug: (...args) => activeLogger.debug(...args),
};

function notifyIfTokenizerReady(): void {
  if (tokenizerModulesReady || !isTokenizerReady()) {
    return;
  }

  tokenizerModulesReady = true;
  for (const listener of readyListeners) {
    try {
      listener();
    } catch (error) {
      logger.error("[tokenizer] Ready listener threw:", error);
    }
  }
  readyListeners.clear();
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
      logger.error(`[tokenizer] Encoding listener threw for '${encodingName}':`, error);
    }
  }
}

/**
 * Registers a listener fired once the tokenizer base and at least one encoding finish loading.
 * Prefer `onTokenizerEncodingLoaded` for UI updates that need per-encoding fidelity.
 */
export function onTokenizerModulesLoaded(listener: () => void): () => void {
  if (tokenizerModulesReady || isTokenizerReady()) {
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
      logger.error(
        `[tokenizer] Encoding listener threw for '${encodingName}' during initial replay:`,
        error
      );
    }
  }

  return () => {
    encodingListeners.delete(listener);
  };
}

function getCachedBaseModules(): TokenizerBaseModules | null {
  return moduleCache.base;
}

async function loadBaseModules(): Promise<TokenizerBaseModules> {
  if (moduleCache.base) {
    return moduleCache.base;
  }

  if (!baseLoadPromise) {
    const timerLabel = "[tokenizer] load base module";
    logger.info(`${timerLabel} started`);
    baseLoadPromise = (async () => {
      const startMs = now();
      try {
        const module = await import("ai-tokenizer");

        assert(
          typeof module.default === "function",
          "Tokenizer base module default export must be a constructor"
        );
        assert(
          typeof module.models === "object" && module.models !== null,
          "Tokenizer base module must export models metadata"
        );
        const baseModules: TokenizerBaseModules = {
          AITokenizer: module.default,
          models: module.models,
        };
        for (const prop of BASE_MODULE_PROPS) {
          assert(prop in baseModules, `Tokenizer base modules missing '${String(prop)}' property`);
        }
        moduleCache.base = baseModules;
        notifyIfTokenizerReady();
        return baseModules;
      } catch (error) {
        logger.error(
          "[tokenizer] Failed to load base tokenizer modules; token counts will rely on approximations until retry succeeds",
          error
        );
        throw error;
      } finally {
        const durationMs = now() - startMs;
        logger.info(`${timerLabel} finished in ${durationMs.toFixed(0)}ms`);
      }
    })();
  }

  try {
    const baseModules = await baseLoadPromise;
    assert(
      moduleCache.base === baseModules,
      "Tokenizer base modules cache must contain the loaded modules"
    );
    return baseModules;
  } catch (error) {
    moduleCache.base = null;
    baseLoadPromise = null;
    throw error;
  } finally {
    if (moduleCache.base) {
      baseLoadPromise = null;
    }
  }
}

function beginLoadBase(): void {
  void loadBaseModules().catch(() => {
    logger.error(
      "[tokenizer] Base tokenizer modules failed to preload; token counts will stay approximate until retry succeeds"
    );
    // Error already logged in loadBaseModules(); leave cache unset so callers retry.
  });
}

function getCachedEncoding(encodingName: string): EncodingModule | undefined {
  assert(
    typeof encodingName === "string" && encodingName.length > 0,
    "Tokenizer encoding name must be a non-empty string"
  );
  return moduleCache.encodings.get(encodingName);
}

async function loadEncodingModule(encodingName: string): Promise<EncodingModule> {
  const cached = getCachedEncoding(encodingName);
  if (cached) {
    return cached;
  }

  let promise = encodingLoadPromises.get(encodingName);
  if (!promise) {
    const loader = ENCODING_LOADERS[encodingName];
    assert(loader, `Tokenizer encoding loader missing for '${encodingName}'`);

    const timerLabel = `[tokenizer] load encoding: ${encodingName}`;
    logger.info(`${timerLabel} started`);

    promise = (async () => {
      const startMs = now();
      try {
        const module = await loader();
        moduleCache.encodings.set(encodingName, module);
        notifyIfTokenizerReady();
        notifyEncodingLoaded(encodingName);
        return module;
      } catch (error) {
        logger.error(
          `[tokenizer] Failed to load tokenizer encoding '${encodingName}'; token counts will fall back to approximations`,
          error
        );
        throw error;
      } finally {
        const durationMs = now() - startMs;
        logger.info(`${timerLabel} finished in ${durationMs.toFixed(0)}ms`);
      }
    })();

    encodingLoadPromises.set(encodingName, promise);
  }

  try {
    const encoding = await promise;
    assert(
      moduleCache.encodings.get(encodingName) === encoding,
      "Tokenizer encoding cache must match the loaded encoding"
    );
    return encoding;
  } catch (error) {
    encodingLoadPromises.delete(encodingName);
    throw error;
  } finally {
    if (moduleCache.encodings.has(encodingName)) {
      encodingLoadPromises.delete(encodingName);
    }
  }
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
  o200k_base: async () =>
    normalizeEncodingModule("o200k_base", await import("ai-tokenizer/encoding/o200k_base")),
  claude: async () =>
    normalizeEncodingModule("claude", await import("ai-tokenizer/encoding/claude")),
  cl100k_base: async () =>
    normalizeEncodingModule("cl100k_base", await import("ai-tokenizer/encoding/cl100k_base")),
  p50k_base: async () =>
    normalizeEncodingModule("p50k_base", await import("ai-tokenizer/encoding/p50k_base")),
};

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
  const allLoaded =
    moduleCache.base && KNOWN_ENCODINGS.every((enc) => moduleCache.encodings.has(enc));

  if (allLoaded) {
    return;
  }

  if (eagerLoadPromise) {
    return eagerLoadPromise;
  }

  logger.info("[tokenizer] loadTokenizerModules() called");

  const timerLabel = "[tokenizer] loadTokenizerModules() total";
  const work = (async () => {
    logger.info("[tokenizer] Starting loads for base + encodings:", KNOWN_ENCODINGS);
    const startMs = now();
    try {
      const basePromise = loadBaseModules();
      const encodingPromises = KNOWN_ENCODINGS.map((enc) => loadEncodingModule(enc));
      await Promise.all([basePromise, ...encodingPromises]);
      logger.info("[tokenizer] All modules loaded successfully");
      notifyIfTokenizerReady();
    } finally {
      const durationMs = now() - startMs;
      logger.info(`${timerLabel} finished in ${durationMs.toFixed(0)}ms`);
    }
  })();

  eagerLoadPromise = work
    .catch((error) => {
      logger.error("[tokenizer] loadTokenizerModules() failed", error);
      throw error;
    })
    .finally(() => {
      eagerLoadPromise = null;
    });

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
  const baseModules = await loadBaseModules();
  assert(baseModules, "Tokenizer base modules must be loaded before selecting encodings");

  const encodingName = getTokenizerEncoding(modelString, baseModules);
  await loadEncodingModule(encodingName);
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
      logger.error("[tokenizer] Async tokenization failed", error);
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
    beginLoadBase();
    return FALLBACK_ENCODING;
  }

  return resolveTokenizerEncoding(modelString, modules);
}

/**
 * Count tokens using loaded tokenizer modules
 * Assumes base module is loaded; encoding will be loaded on-demand via Proxy if needed
 */
function countTokensWithLoadedModules(
  text: string,
  modelString: string
): TokenCountResult | Promise<TokenCountResult> {
  const cachedBase = getCachedBaseModules();
  if (!cachedBase) {
    return (async () => {
      const baseModules = await loadBaseModules();
      const encodingName = getTokenizerEncoding(modelString, baseModules);
      const encoding = await loadEncodingModule(encodingName);
      const tokenizer = new baseModules.AITokenizer(encoding);
      const value = tokenizer.count(text);
      assert(Number.isFinite(value) && value >= 0, "Tokenizer must return a non-negative number");
      return { value, cache: true } satisfies TokenCountCacheEntry;
    })();
  }

  const encodingName = getTokenizerEncoding(modelString, cachedBase);
  const cachedEncoding = getCachedEncoding(encodingName);
  if (cachedEncoding) {
    const tokenizer = new cachedBase.AITokenizer(cachedEncoding);
    const value = tokenizer.count(text);
    assert(Number.isFinite(value) && value >= 0, "Tokenizer must return a non-negative number");
    return { value, cache: true } satisfies TokenCountCacheEntry;
  }

  return (async () => {
    const encoding = await loadEncodingModule(encodingName);
    const activeBase = getCachedBaseModules();
    assert(activeBase, "Tokenizer base modules must be available after loading encoding");
    const tokenizer = new activeBase.AITokenizer(encoding);
    const value = tokenizer.count(text);
    assert(Number.isFinite(value) && value >= 0, "Tokenizer must return a non-negative number");
    return { value, cache: true } satisfies TokenCountCacheEntry;
  })();
}

/**
 * Get the appropriate tokenizer for a given model string
 *
 * @param modelString - Model identifier (e.g., "anthropic:claude-opus-4-1", "openai:gpt-4")
 * @returns Tokenizer interface with name and countTokens function
 */
export function getTokenizerForModel(modelString: string): Tokenizer {
  // Start loading tokenizer modules in background (idempotent)
  void loadTokenizerModules().catch((error) => {
    logger.error("[tokenizer] Failed to eagerly load tokenizer modules", error);
  });

  return {
    get encoding() {
      // NOTE: This Proxy-style getter runs before encodings finish loading; callers must tolerate
      // fallback values (and potential transient undefined) until onTokenizerEncodingLoaded fires.
      return getTokenizerEncoding(modelString, moduleCache.base);
    },
    countTokens: (text: string) => {
      return countTokensCached(text, () => {
        try {
          const result = countTokensWithLoadedModules(text, modelString);
          if (isPromiseLike<TokenCountResult>(result)) {
            return result.catch((error) => {
              logger.error(TOKENIZATION_FALLBACK_MESSAGE, error);
              return fallbackTokenCount(text);
            });
          }
          return result;
        } catch (error) {
          logger.error(TOKENIZATION_FALLBACK_MESSAGE, error);
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
 * Test helper to fully reset tokenizer state between test cases.
 * Do NOT call from production code.
 */
export function __resetTokenizerForTests(): void {
  moduleCache.base = null;
  moduleCache.encodings.clear();
  baseLoadPromise = null;
  encodingLoadPromises.clear();
  readyListeners.clear();
  tokenizerModulesReady = false;
  encodingListeners.clear();
  eagerLoadPromise = null;
  tokenCountCache.clear();
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

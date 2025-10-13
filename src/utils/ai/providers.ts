/**
 * Lazy-loaded AI provider modules to reduce app startup time.
 *
 * Performance considerations:
 * - AI SDK modules (@ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google) are ~2-3MB total
 * - Loading them synchronously at startup adds ~4-5 seconds to app launch time
 * - These modules are only needed when user sends first message (not at startup)
 *
 * Implementation:
 * - Module-level cache stores loaded SDKs after first load
 * - Promise cache prevents duplicate parallel loads
 * - Idempotent: safe to call loadProviders() multiple times
 * - All exports use dynamic import() instead of static import statements
 *
 * Usage:
 * ```typescript
 * // In services/aiService.ts
 * const { createAnthropic } = await loadProviders();
 * const provider = createAnthropic({ apiKey });
 * ```
 *
 * eslint-disable no-restricted-syntax -- Dynamic imports required for lazy-loading performance optimization.
 * Static imports of AI SDKs add 4-5s to app startup. These modules are only needed when user sends first
 * message, not at app launch.
 */

// Module-level cache for loaded AI SDK modules
interface ProviderModules {
  createAnthropic: typeof import("@ai-sdk/anthropic").createAnthropic;
  anthropic: typeof import("@ai-sdk/anthropic").anthropic;
  createOpenAI: typeof import("@ai-sdk/openai").createOpenAI;
  openai: typeof import("@ai-sdk/openai").openai;
  google: typeof import("@ai-sdk/google").google;
}

let providerModules: ProviderModules | null = null;
let loadPromise: Promise<void> | null = null;

/**
 * Load AI provider modules asynchronously.
 * Safe to call multiple times - subsequent calls reuse cached modules.
 */
export async function loadProviders(): Promise<ProviderModules> {
  // Return cached modules if already loaded
  if (providerModules) {
    return providerModules;
  }

  // If loading already in progress, wait for it
  if (loadPromise) {
    await loadPromise;
    return providerModules!;
  }

  // Start loading modules in parallel
  loadPromise = (async () => {
    const [anthropicModule, openaiModule, googleModule] = await Promise.all([
      import("@ai-sdk/anthropic"),
      import("@ai-sdk/openai"),
      import("@ai-sdk/google"),
    ]);

    providerModules = {
      createAnthropic: anthropicModule.createAnthropic,
      anthropic: anthropicModule.anthropic,
      createOpenAI: openaiModule.createOpenAI,
      openai: openaiModule.openai,
      google: googleModule.google,
    };
  })();

  await loadPromise;
  return providerModules!;
}

/**
 * Check if provider modules are already loaded (synchronous check).
 * Useful for optimization paths that want to avoid async if already available.
 */
export function areProvidersLoaded(): boolean {
  return providerModules !== null;
}


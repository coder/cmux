/**
 * Centralized provider registry mapping provider names to their Vercel AI SDK packages
 *
 * This prevents bugs where a provider is added to aiService but forgotten in PROVIDERS_LIST,
 * and documents which SDK package each provider uses.
 *
 * When adding a new provider:
 * 1. Add entry mapping provider name to its SDK package
 * 2. Implement provider handling in aiService.ts getModel()
 * 3. Runtime check will fail if provider in registry but no handler
 */
export const PROVIDER_REGISTRY = {
  anthropic: "@ai-sdk/anthropic",
  openai: "@ai-sdk/openai",
  ollama: "ollama-ai-provider-v2",
  openrouter: "@openrouter/ai-sdk-provider",
} as const;

/**
 * Union type of all supported provider names
 */
export type ProviderName = keyof typeof PROVIDER_REGISTRY;

/**
 * Array of all supported provider names (for UI lists, iteration, etc.)
 */
export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_REGISTRY) as ProviderName[];

/**
 * Type guard to check if a string is a valid provider name
 */
export function isValidProvider(provider: string): provider is ProviderName {
  return provider in PROVIDER_REGISTRY;
}

/**
 * Typed import helpers for provider packages
 *
 * These functions provide type-safe dynamic imports for provider packages by using
 * PROVIDER_REGISTRY as the single source of truth for package names. While TypeScript
 * cannot infer return types from dynamic imports with variables, the functions are
 * safe because:
 * 1. PROVIDER_REGISTRY is defined with `as const` (immutable literal types)
 * 2. Package names are validated at runtime (import will fail if invalid)
 * 3. Consuming code doesn't need explicit types - inference works from usage
 *
 * The eslint-disable is localized to these wrapper functions rather than spread
 * throughout the codebase at call sites.
 */

/**
 * Dynamically import the Anthropic provider package
 */
export async function importAnthropic() {
  const { anthropic } = PROVIDER_REGISTRY;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return await import(anthropic);
}

/**
 * Dynamically import the OpenAI provider package
 */
export async function importOpenAI() {
  const { openai } = PROVIDER_REGISTRY;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return await import(openai);
}

/**
 * Dynamically import the Ollama provider package
 */
export async function importOllama() {
  const { ollama } = PROVIDER_REGISTRY;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return await import(ollama);
}

/**
 * Dynamically import the OpenRouter provider package
 */
export async function importOpenRouter() {
  const { openrouter } = PROVIDER_REGISTRY;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return await import(openrouter);
}

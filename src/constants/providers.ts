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

/**
 * Centralized provider registry
 *
 * All supported AI providers must be listed here. This prevents bugs where
 * a new provider is added to aiService but forgotten in PROVIDERS_LIST.
 *
 * When adding a new provider:
 * 1. Add the provider name to this array
 * 2. Implement provider handling in aiService.ts getModel()
 * 3. The test in aiService will fail if not all providers are handled
 */
export const SUPPORTED_PROVIDERS = [
  "anthropic",
  "openai",
  "ollama",
  "openrouter",
] as const;

/**
 * Union type of all supported provider names
 */
export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Type guard to check if a string is a valid provider name
 */
export function isValidProvider(provider: string): provider is ProviderName {
  return SUPPORTED_PROVIDERS.includes(provider as ProviderName);
}

/**
 * Assert exhaustiveness at compile-time for switch/if-else chains
 *
 * Usage:
 * ```ts
 * if (provider === 'anthropic') { ... }
 * else if (provider === 'openai') { ... }
 * else if (provider === 'ollama') { ... }
 * else if (provider === 'openrouter') { ... }
 * else {
 *   assertExhaustive(provider); // TypeScript error if a case is missing
 * }
 * ```
 */
export function assertExhaustive(value: never): never {
  throw new Error(`Unhandled provider case: ${value}`);
}

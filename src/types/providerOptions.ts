/**
 * Cmux provider-specific options that get passed through the stack.
 * Used by both frontend and backend to configure provider-specific features
 * without polluting function signatures with individual flags.
 *
 * Note: This is separate from the AI SDK's provider options
 * (src/utils/ai/providerOptions.ts) which configures thinking levels, etc.
 * These options configure features that need to be applied at the provider
 * configuration level (e.g., custom headers, beta features).
 */

/**
 * Anthropic-specific options
 */
export interface AnthropicProviderOptions {
  /** Enable 1M context window (requires beta header) */
  use1MContext?: boolean;
}

/**
 * OpenAI-specific options
 */
export interface OpenAIProviderOptions {
  /** Disable automatic context truncation (useful for testing) */
  disableAutoTruncation?: boolean;
}

/**
 * Cmux provider options - used by both frontend and backend
 */
export interface CmuxProviderOptions {
  /** Provider-specific options */
  anthropic?: AnthropicProviderOptions;
  openai?: OpenAIProviderOptions;
}

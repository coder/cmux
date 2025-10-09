/**
 * Frontend provider-specific options that get passed through the stack.
 * This allows us to cleanly handle provider-specific features without
 * polluting function signatures with individual flags.
 *
 * Note: This is separate from the AI SDK's provider options
 * (src/utils/ai/providerOptions.ts) which configures thinking levels, etc.
 * These options configure features that need to be applied at the provider
 * configuration level (e.g., custom headers, beta features).
 */

/**
 * Anthropic-specific frontend options
 */
export interface AnthropicFrontendOptions {
  /** Enable 1M context window (requires beta header) */
  use1MContext?: boolean;
}

/**
 * OpenAI-specific frontend options
 * Currently empty but reserved for future options
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OpenAIFrontendOptions {
  // Placeholder for future OpenAI-specific options
}

/**
 * Union type for all frontend provider options
 */
export interface FrontendProviderOptions {
  anthropic?: AnthropicFrontendOptions;
  openai?: OpenAIFrontendOptions;
}

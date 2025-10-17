/**
 * Provider factory with lazy loading
 *
 * Creates language model instances for different AI providers. Providers are
 * lazy-loaded on first use to minimize startup time.
 */

import type { LanguageModel } from "ai";

/**
 * Configuration for provider creation
 */
export interface ProviderFactoryConfig {
  /** API key for the provider */
  apiKey?: string;
  /** Base URL override for the provider API */
  baseURL?: string;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

/**
 * Create a language model instance for the given provider
 *
 * This function lazy-loads the provider SDK on first use. Only the requested
 * provider's code is loaded, reducing startup time.
 *
 * @param modelString Full model string in format "provider:model-id"
 * @param config Provider configuration
 * @returns Promise resolving to language model instance
 * @throws Error if provider is unknown or model string is invalid
 */
export async function createProviderModel(
  modelString: string,
  config: ProviderFactoryConfig
): Promise<LanguageModel> {
  const [provider, modelId] = modelString.split(":");

  if (!provider || !modelId) {
    throw new Error(`Invalid model string: ${modelString}. Expected format: "provider:model-id"`);
  }

  switch (provider) {
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anthropicProvider = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        headers: config.headers,
        fetch: config.fetch,
      });
      return anthropicProvider(modelId);
    }

    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");

      const openaiProvider = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        headers: config.headers,
        fetch: config.fetch,
      });

      // OpenAI Responses API uses previousResponseId for conversation persistence
      // No middleware needed - reasoning state is managed via previousResponseId
      return openaiProvider(modelId);
    }

    default:
      throw new Error(`Unknown provider: ${provider}. Supported providers: anthropic, openai`);
  }
}

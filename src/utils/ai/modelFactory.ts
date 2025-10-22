/**
 * Utility for creating AI SDK model instances from model strings.
 * Centralizes provider detection and model creation logic.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// ProvidersConfig is the type from providers.jsonc (Record<string, unknown>)
type ProvidersConfig = Record<string, Record<string, unknown>>;

/**
 * Creates a language model instance from a model string like "anthropic:claude-3-5-sonnet-20241022"
 * @param modelString Format: "provider:model-id"
 * @param providersConfig Provider configuration (API keys, base URLs, etc.)
 * @returns Language model instance ready for use with AI SDK
 */
export function createModelFromString(
  modelString: string,
  providersConfig?: ProvidersConfig
): LanguageModel {
  const [providerName, modelId] = modelString.split(":");

  if (!modelId) {
    throw new Error(`Invalid model string format: "${modelString}". Expected "provider:model-id"`);
  }

  switch (providerName) {
    case "anthropic": {
      const providerConfig = providersConfig?.[providerName] ?? {};
      const anthropic = createAnthropic(providerConfig);
      return anthropic(modelId);
    }
    case "openai": {
      const providerConfig = providersConfig?.[providerName] ?? {};
      const openai = createOpenAI(providerConfig);
      return openai(modelId);
    }
    default:
      throw new Error(
        `Unsupported provider: "${providerName}". Supported providers: anthropic, openai`
      );
  }
}

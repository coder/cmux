import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ProviderConfig } from "../config";
import { Err, Ok, type Result } from "../types/result";
import type { SendMessageError } from "../types/errors";

interface ProviderAdapter {
  validate: (
    providerName: string,
    config: ProviderConfig | undefined
  ) => Result<ProviderConfig, SendMessageError>;
  instantiate: (config: ProviderConfig, modelId: string) => LanguageModel;
}

interface ProviderAdapterOptions {
  requiredKeys?: string[];
}

type ProviderFactory = (config: ProviderConfig) => (modelId: string) => LanguageModel;

function createProviderAdapter(
  factory: ProviderFactory,
  options: ProviderAdapterOptions = {}
): ProviderAdapter {
  const { requiredKeys = [] } = options;

  return {
    validate(providerName, config) {
      if (!config) {
        return Err({ type: "provider_not_configured", provider: providerName });
      }

      for (const key of requiredKeys) {
        const value = config[key];
        if (value === undefined || value === null || value === "") {
          if (key === "apiKey") {
            return Err({ type: "api_key_not_found", provider: providerName });
          }

          return Err({
            type: "unknown",
            raw: `Missing required configuration '${key}' for provider '${providerName}'`,
          });
        }
      }

      return Ok(config);
    },
    instantiate(config, modelId) {
      const provider = factory(config);
      return provider(modelId);
    },
  };
}

const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  anthropic: createProviderAdapter(createAnthropic, { requiredKeys: ["apiKey"] }),
  openai: createProviderAdapter(createOpenAI, { requiredKeys: ["apiKey"] }),
  google: createProviderAdapter(createGoogleGenerativeAI, { requiredKeys: ["apiKey"] }),
};

export function getProviderAdapter(providerName: string): ProviderAdapter | undefined {
  return PROVIDER_ADAPTERS[providerName];
}

export function registerProviderAdapter(providerName: string, adapter: ProviderAdapter): void {
  PROVIDER_ADAPTERS[providerName] = adapter;
}

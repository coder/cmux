import modelsData from "./models.json";
import { modelsExtra } from "./models-extra";

export interface ModelStats {
  max_input_tokens: number;
  input_cost_per_token: number;
  output_cost_per_token: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  // Elevated pricing for 1M context window (200k-1M tokens)
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
}

interface RawModelData {
  max_input_tokens?: number | string;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  [key: string]: unknown;
}

/**
 * Extracts the model name from a Vercel AI SDK model string
 * @param modelString - Format: "provider:model-name" or just "model-name"
 * @returns The model name without the provider prefix
 */
function extractModelName(modelString: string): string {
  const parts = modelString.split(":");
  return parts.length > 1 ? parts[1] : parts[0];
}

/**
 * Gets model statistics for a given Vercel AI SDK model string
 * @param modelString - Format: "provider:model-name" (e.g., "anthropic:claude-opus-4-1")
 * @returns ModelStats or null if model not found
 */
export function getModelStats(modelString: string): ModelStats | null {
  const modelName = extractModelName(modelString);

  // Check main models.json first
  let data = (modelsData as Record<string, RawModelData>)[modelName];

  // Fall back to models-extra.ts if not found
  if (!data) {
    data = (modelsExtra as Record<string, RawModelData>)[modelName];
  }

  if (!data) {
    return null;
  }

  // Validate that we have required fields and correct types
  if (
    typeof data.max_input_tokens !== "number" ||
    typeof data.input_cost_per_token !== "number" ||
    typeof data.output_cost_per_token !== "number"
  ) {
    return null;
  }

  return {
    max_input_tokens: data.max_input_tokens,
    input_cost_per_token: data.input_cost_per_token,
    output_cost_per_token: data.output_cost_per_token,
    cache_creation_input_token_cost:
      typeof data.cache_creation_input_token_cost === "number"
        ? data.cache_creation_input_token_cost
        : undefined,
    cache_read_input_token_cost:
      typeof data.cache_read_input_token_cost === "number"
        ? data.cache_read_input_token_cost
        : undefined,
    input_cost_per_token_above_200k_tokens:
      typeof data.input_cost_per_token_above_200k_tokens === "number"
        ? data.input_cost_per_token_above_200k_tokens
        : undefined,
    output_cost_per_token_above_200k_tokens:
      typeof data.output_cost_per_token_above_200k_tokens === "number"
        ? data.output_cost_per_token_above_200k_tokens
        : undefined,
  };
}

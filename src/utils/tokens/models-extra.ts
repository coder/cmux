/**
 * Extra models not yet in LiteLLM's official models.json
 * This file is consulted as a fallback when a model is not found in the main file.
 * Models should be removed from here once they appear in the upstream LiteLLM repository.
 */

interface ModelData {
  max_input_tokens: number;
  max_output_tokens?: number;
  input_cost_per_token: number;
  output_cost_per_token: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  litellm_provider?: string;
  mode?: string;
  supports_function_calling?: boolean;
  supports_vision?: boolean;
  supports_reasoning?: boolean;
  supports_response_schema?: boolean;
  knowledge_cutoff?: string;
  supported_endpoints?: string[];
}

export const modelsExtra: Record<string, ModelData> = {
  // GPT-5 Pro - Released October 6, 2025 at DevDay
  // $15/M input, $120/M output
  // Only available via OpenAI's Responses API
  "gpt-5-pro": {
    max_input_tokens: 400000,
    max_output_tokens: 272000,
    input_cost_per_token: 0.000015, // $15 per million input tokens
    output_cost_per_token: 0.00012, // $120 per million output tokens
    litellm_provider: "openai",
    mode: "chat",
    supports_function_calling: true,
    supports_vision: true,
    supports_reasoning: true,
    supports_response_schema: true,
    knowledge_cutoff: "2024-09-30",
    supported_endpoints: ["/v1/responses"],
  },
};

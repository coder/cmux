"use strict";
/**
 * Extra models not yet in LiteLLM's official models.json
 * This file is consulted as a fallback when a model is not found in the main file.
 * Models should be removed from here once they appear in the upstream LiteLLM repository.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelsExtra = void 0;
exports.modelsExtra = {
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
//# sourceMappingURL=models-extra.js.map
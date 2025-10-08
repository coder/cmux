"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModelStats = getModelStats;
const models_json_1 = __importDefault(require("./models.json"));
const models_extra_1 = require("./models-extra");
/**
 * Extracts the model name from a Vercel AI SDK model string
 * @param modelString - Format: "provider:model-name" or just "model-name"
 * @returns The model name without the provider prefix
 */
function extractModelName(modelString) {
    const parts = modelString.split(":");
    return parts.length > 1 ? parts[1] : parts[0];
}
/**
 * Gets model statistics for a given Vercel AI SDK model string
 * @param modelString - Format: "provider:model-name" (e.g., "anthropic:claude-opus-4-1")
 * @returns ModelStats or null if model not found
 */
function getModelStats(modelString) {
    const modelName = extractModelName(modelString);
    // Check main models.json first
    let data = models_json_1.default[modelName];
    // Fall back to models-extra.ts if not found
    if (!data) {
        data = models_extra_1.modelsExtra[modelName];
    }
    if (!data) {
        return null;
    }
    // Validate that we have required fields and correct types
    if (typeof data.max_input_tokens !== "number" ||
        typeof data.input_cost_per_token !== "number" ||
        typeof data.output_cost_per_token !== "number") {
        return null;
    }
    return {
        max_input_tokens: data.max_input_tokens,
        input_cost_per_token: data.input_cost_per_token,
        output_cost_per_token: data.output_cost_per_token,
        cache_creation_input_token_cost: typeof data.cache_creation_input_token_cost === "number"
            ? data.cache_creation_input_token_cost
            : undefined,
        cache_read_input_token_cost: typeof data.cache_read_input_token_cost === "number"
            ? data.cache_read_input_token_cost
            : undefined,
    };
}
//# sourceMappingURL=modelStats.js.map
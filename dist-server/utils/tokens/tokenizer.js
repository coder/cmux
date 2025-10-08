"use strict";
/**
 * Token calculation utilities for chat statistics
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenizerForModel = getTokenizerForModel;
exports.countTokensForData = countTokensForData;
exports.getToolDefinitionTokens = getToolDefinitionTokens;
const tiktoken_1 = require("@dqbd/tiktoken");
const lru_cache_1 = require("lru-cache");
const crc_32_1 = __importDefault(require("crc-32"));
const toolDefinitions_1 = require("../../utils/tools/toolDefinitions");
/**
 * Module-level cache for tiktoken encoders
 * Encoders are expensive to construct, so we cache and reuse them
 */
const tiktokenEncoderCache = new Map();
/**
 * LRU cache for token counts by text checksum
 * Avoids re-tokenizing identical strings (system messages, tool definitions, etc.)
 * Key: CRC32 checksum of text, Value: token count
 */
const tokenCountCache = new lru_cache_1.LRUCache({
    max: 500000, // Max entries (safety limit)
    maxSize: 16 * 1024 * 1024, // 16MB total cache size
    sizeCalculation: () => {
        // Each entry: ~8 bytes (key) + ~8 bytes (value) + ~32 bytes (LRU overhead) ≈ 48 bytes
        return 48;
    },
});
/**
 * Get or create a cached tiktoken encoder for a given OpenAI model
 * This implements lazy initialization - encoder is only created on first use
 */
function getOrCreateTiktokenEncoder(modelName) {
    if (!tiktokenEncoderCache.has(modelName)) {
        tiktokenEncoderCache.set(modelName, (0, tiktoken_1.encoding_for_model)(modelName));
    }
    return tiktokenEncoderCache.get(modelName);
}
/**
 * Count tokens with caching via CRC32 checksum
 * Wraps the tokenization logic to avoid re-tokenizing identical strings
 */
function countTokensCached(text, tokenizeFn) {
    const checksum = crc_32_1.default.str(text);
    const cached = tokenCountCache.get(checksum);
    if (cached !== undefined) {
        return cached;
    }
    const count = tokenizeFn();
    tokenCountCache.set(checksum, count);
    return count;
}
/**
 * Get the appropriate tokenizer for a given model string
 *
 * @param modelString - Model identifier (e.g., "anthropic:claude-opus-4-1", "openai:gpt-4")
 * @returns Tokenizer interface with name and countTokens function
 */
function getTokenizerForModel(_modelString) {
    // Use GPT-4o tokenizer for Anthropic models - better approximation than char count
    // Note: Not 100% accurate for Claude 3+, but close enough for cost estimation
    return {
        name: "tiktoken",
        countTokens: (text) => {
            return countTokensCached(text, () => {
                try {
                    // Use o200k_base encoding for GPT-4o and newer models (GPT-5, o1, etc.)
                    // Encoder is cached and reused for performance
                    const encoder = getOrCreateTiktokenEncoder("gpt-4o");
                    const tokens = encoder.encode(text);
                    return tokens.length;
                }
                catch (error) {
                    // Log the error and fallback to approximation
                    console.error("Failed to tokenize with js-tiktoken, falling back to approximation:", error);
                    return Math.ceil(text.length / 4);
                }
            });
        },
    };
}
/**
 * Calculate token counts for serialized data (tool args/results)
 */
function countTokensForData(data, tokenizer) {
    const serialized = JSON.stringify(data);
    return tokenizer.countTokens(serialized);
}
/**
 * Get estimated token count for tool definitions
 * These are the schemas sent to the API for each tool
 *
 * @param toolName The name of the tool (bash, file_read, web_search, etc.)
 * @param modelString The model string to get accurate tool definitions
 * @returns Estimated token count for the tool definition
 */
function getToolDefinitionTokens(toolName, modelString) {
    try {
        // Check if this tool is available for this model
        const availableTools = (0, toolDefinitions_1.getAvailableTools)(modelString);
        if (!availableTools.includes(toolName)) {
            // Tool not available for this model
            return 0;
        }
        // Get the tool schema
        const toolSchemas = (0, toolDefinitions_1.getToolSchemas)();
        const toolSchema = toolSchemas[toolName];
        if (!toolSchema) {
            // Tool not found, return a default estimate
            return 40;
        }
        // Serialize the tool definition to estimate tokens
        const serialized = JSON.stringify(toolSchema);
        const tokenizer = getTokenizerForModel(modelString);
        return tokenizer.countTokens(serialized);
    }
    catch {
        // Fallback to estimates if we can't get the actual definition
        const fallbackSizes = {
            bash: 65,
            file_read: 45,
            file_edit_replace: 70,
            file_edit_insert: 50,
            web_search: 50,
            google_search: 50,
        };
        return fallbackSizes[toolName] || 40;
    }
}
//# sourceMappingURL=tokenizer.js.map
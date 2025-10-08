"use strict";
/**
 * Shared token statistics calculation logic
 * Used by both frontend (ChatContext) and backend (debug commands)
 *
 * IMPORTANT: This utility is intentionally abstracted so that the debug command
 * (`bun debug costs`) has exact parity with the UI display in the Costs tab.
 * Any changes to token calculation logic should be made here to maintain consistency.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDisplayUsage = createDisplayUsage;
exports.sumUsageHistory = sumUsageHistory;
exports.calculateTokenStats = calculateTokenStats;
const tokenizer_1 = require("./tokenizer");
const modelStats_1 = require("./modelStats");
/**
 * Create a display-friendly usage object from AI SDK usage
 */
function createDisplayUsage(usage, model, providerMetadata) {
    if (!usage)
        return undefined;
    // Provider-specific token handling:
    // - OpenAI: inputTokens is INCLUSIVE of cachedInputTokens
    // - Anthropic: inputTokens EXCLUDES cachedInputTokens
    const cachedTokens = usage.cachedInputTokens ?? 0;
    const rawInputTokens = usage.inputTokens ?? 0;
    // Detect provider from model string
    const isOpenAI = model.startsWith("openai:");
    // For OpenAI, subtract cached tokens to get uncached input tokens
    const inputTokens = isOpenAI ? Math.max(0, rawInputTokens - cachedTokens) : rawInputTokens;
    // Extract cache creation tokens from provider metadata (Anthropic-specific)
    const cacheCreateTokens = providerMetadata?.anthropic
        ?.cacheCreationInputTokens ?? 0;
    // Calculate output tokens excluding reasoning
    const outputWithoutReasoning = Math.max(0, (usage.outputTokens ?? 0) - (usage.reasoningTokens ?? 0));
    // Get model stats for cost calculation
    const modelStats = (0, modelStats_1.getModelStats)(model);
    // Calculate costs based on model stats (undefined if model unknown)
    let inputCost;
    let cachedCost;
    let cacheCreateCost;
    let outputCost;
    let reasoningCost;
    if (modelStats) {
        inputCost = inputTokens * modelStats.input_cost_per_token;
        cachedCost = cachedTokens * (modelStats.cache_read_input_token_cost ?? 0);
        cacheCreateCost = cacheCreateTokens * (modelStats.cache_creation_input_token_cost ?? 0);
        outputCost = outputWithoutReasoning * modelStats.output_cost_per_token;
        reasoningCost = (usage.reasoningTokens ?? 0) * modelStats.output_cost_per_token;
    }
    return {
        input: {
            tokens: inputTokens,
            cost_usd: inputCost,
        },
        cached: {
            tokens: cachedTokens,
            cost_usd: cachedCost,
        },
        cacheCreate: {
            tokens: cacheCreateTokens,
            cost_usd: cacheCreateCost,
        },
        output: {
            tokens: outputWithoutReasoning,
            cost_usd: outputCost,
        },
        reasoning: {
            tokens: usage.reasoningTokens ?? 0,
            cost_usd: reasoningCost,
        },
    };
}
/**
 * Sum multiple ChatUsageDisplay objects into a single cumulative display
 * Used for showing total costs across multiple API responses
 */
function sumUsageHistory(usageHistory) {
    if (usageHistory.length === 0)
        return undefined;
    // Track if any costs are undefined (model pricing unknown)
    let hasUndefinedCosts = false;
    const sum = {
        input: { tokens: 0, cost_usd: 0 },
        cached: { tokens: 0, cost_usd: 0 },
        cacheCreate: { tokens: 0, cost_usd: 0 },
        output: { tokens: 0, cost_usd: 0 },
        reasoning: { tokens: 0, cost_usd: 0 },
    };
    for (const usage of usageHistory) {
        // Iterate over each component and sum tokens and costs
        for (const key of Object.keys(sum)) {
            sum[key].tokens += usage[key].tokens;
            if (usage[key].cost_usd === undefined) {
                hasUndefinedCosts = true;
            }
            else {
                sum[key].cost_usd = (sum[key].cost_usd ?? 0) + (usage[key].cost_usd ?? 0);
            }
        }
    }
    // If any costs were undefined, set all to undefined
    if (hasUndefinedCosts) {
        sum.input.cost_usd = undefined;
        sum.cached.cost_usd = undefined;
        sum.cacheCreate.cost_usd = undefined;
        sum.output.cost_usd = undefined;
        sum.reasoning.cost_usd = undefined;
    }
    return sum;
}
/**
 * Calculate token statistics from raw CmuxMessages
 * This is the single source of truth for token counting
 *
 * @param messages - Array of CmuxMessages from chat history
 * @param model - Model string (e.g., "anthropic:claude-opus-4-1")
 * @returns ChatStats with token breakdown by consumer and usage history
 */
function calculateTokenStats(messages, model) {
    if (messages.length === 0) {
        return {
            consumers: [],
            totalTokens: 0,
            model,
            tokenizerName: "No messages",
            usageHistory: [],
        };
    }
    performance.mark("calculateTokenStatsStart");
    const tokenizer = (0, tokenizer_1.getTokenizerForModel)(model);
    const consumerMap = new Map();
    const toolsWithDefinitions = new Set(); // Track which tools have definitions included
    const usageHistory = [];
    let systemMessageTokens = 0; // Accumulate system message tokens across all requests
    // Calculate tokens by content producer (User, Assistant, individual tools)
    // This shows what activities are consuming tokens, useful for debugging costs
    for (const message of messages) {
        if (message.role === "user") {
            // User message text
            let userTokens = 0;
            for (const part of message.parts) {
                if (part.type === "text") {
                    userTokens += tokenizer.countTokens(part.text);
                }
            }
            const existing = consumerMap.get("User") ?? { fixed: 0, variable: 0 };
            consumerMap.set("User", { fixed: 0, variable: existing.variable + userTokens });
        }
        else if (message.role === "assistant") {
            // Accumulate system message tokens from this request
            if (message.metadata?.systemMessageTokens) {
                systemMessageTokens += message.metadata.systemMessageTokens;
            }
            // Store usage in history for comparison with estimates
            if (message.metadata?.usage) {
                const usage = createDisplayUsage(message.metadata.usage, message.metadata.model ?? model, // Use actual model from request, not UI model
                message.metadata.providerMetadata);
                if (usage) {
                    usageHistory.push(usage);
                }
            }
            // Count assistant text separately from tools
            // IMPORTANT: Batch tokenization by type to avoid calling tokenizer for each tiny part
            // (reasoning messages can have 600+ parts like "I", "'m", " thinking")
            // Group and concatenate parts by type
            const textParts = message.parts.filter((p) => p.type === "text");
            const reasoningParts = message.parts.filter((p) => p.type === "reasoning");
            // Tokenize text parts once (not per part!)
            if (textParts.length > 0) {
                const allText = textParts.map((p) => p.text).join("");
                const textTokens = tokenizer.countTokens(allText);
                const existing = consumerMap.get("Assistant") ?? { fixed: 0, variable: 0 };
                consumerMap.set("Assistant", { fixed: 0, variable: existing.variable + textTokens });
            }
            // Tokenize reasoning parts once (not per part!)
            if (reasoningParts.length > 0) {
                const allReasoning = reasoningParts.map((p) => p.text).join("");
                const reasoningTokens = tokenizer.countTokens(allReasoning);
                const existing = consumerMap.get("Reasoning") ?? { fixed: 0, variable: 0 };
                consumerMap.set("Reasoning", { fixed: 0, variable: existing.variable + reasoningTokens });
            }
            // Handle tool parts
            for (const part of message.parts) {
                if (part.type === "dynamic-tool") {
                    // Count tool arguments
                    const argsTokens = (0, tokenizer_1.countTokensForData)(part.input, tokenizer);
                    // Count tool results if available
                    // Tool results have nested structure: { type: "json", value: {...} }
                    let resultTokens = 0;
                    if (part.state === "output-available" && part.output) {
                        // Extract the actual data from the nested output structure
                        const outputData = typeof part.output === "object" && part.output !== null && "value" in part.output
                            ? part.output.value
                            : part.output;
                        // Special handling for web_search encrypted content
                        if (part.toolName === "web_search" && Array.isArray(outputData)) {
                            // Check if this is encrypted web search results
                            const hasEncryptedContent = outputData.some((item) => item !== null &&
                                typeof item === "object" &&
                                "encryptedContent" in item &&
                                typeof item.encryptedContent === "string");
                            if (hasEncryptedContent) {
                                // Calculate tokens for encrypted content with heuristic
                                // Encrypted content is base64 encoded and then encrypted/compressed
                                // Apply reduction factors:
                                // 1. Remove base64 overhead (multiply by 0.75)
                                // 2. Apply an estimated token reduction factor of 4
                                let encryptedChars = 0;
                                for (const item of outputData) {
                                    if (item !== null &&
                                        typeof item === "object" &&
                                        "encryptedContent" in item &&
                                        typeof item.encryptedContent === "string") {
                                        encryptedChars += item.encryptedContent
                                            .length;
                                    }
                                }
                                // Use heuristic: encrypted chars / 40 for token estimation
                                resultTokens = Math.ceil(encryptedChars * 0.75);
                            }
                            else {
                                // Normal web search results without encryption
                                resultTokens = (0, tokenizer_1.countTokensForData)(outputData, tokenizer);
                            }
                        }
                        else {
                            // Normal tool results
                            resultTokens = (0, tokenizer_1.countTokensForData)(outputData, tokenizer);
                        }
                    }
                    // Get existing or create new consumer for this tool
                    const existing = consumerMap.get(part.toolName) ?? { fixed: 0, variable: 0 };
                    // Add tool definition tokens if this is the first time we see this tool
                    let fixedTokens = existing.fixed;
                    if (!toolsWithDefinitions.has(part.toolName)) {
                        fixedTokens += (0, tokenizer_1.getToolDefinitionTokens)(part.toolName, model);
                        toolsWithDefinitions.add(part.toolName);
                    }
                    // Add variable tokens (args + results)
                    const variableTokens = existing.variable + argsTokens + resultTokens;
                    consumerMap.set(part.toolName, { fixed: fixedTokens, variable: variableTokens });
                }
            }
        }
    }
    // Add system message tokens as a consumer if present
    if (systemMessageTokens > 0) {
        consumerMap.set("System", { fixed: 0, variable: systemMessageTokens });
    }
    // Calculate total tokens
    const totalTokens = Array.from(consumerMap.values()).reduce((sum, val) => sum + val.fixed + val.variable, 0);
    // Create sorted consumer array (descending by token count)
    const consumers = Array.from(consumerMap.entries())
        .map(([name, counts]) => {
        const total = counts.fixed + counts.variable;
        return {
            name,
            tokens: total,
            percentage: totalTokens > 0 ? (total / totalTokens) * 100 : 0,
            fixedTokens: counts.fixed > 0 ? counts.fixed : undefined,
            variableTokens: counts.variable > 0 ? counts.variable : undefined,
        };
    })
        .sort((a, b) => b.tokens - a.tokens);
    return {
        consumers,
        totalTokens,
        model,
        tokenizerName: tokenizer.name,
        usageHistory,
    };
}
//# sourceMappingURL=tokenStatsCalculator.js.map
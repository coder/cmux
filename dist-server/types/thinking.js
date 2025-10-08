"use strict";
/**
 * Thinking/Reasoning level types and mappings for AI models
 *
 * This module provides a unified interface for controlling reasoning across
 * different AI providers (Anthropic, OpenAI, etc.)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPENAI_REASONING_EFFORT = exports.ANTHROPIC_THINKING_BUDGETS = void 0;
/**
 * Anthropic thinking token budget mapping
 *
 * These heuristics balance thinking depth with response time and cost:
 * - off: No extended thinking
 * - low: Quick thinking for straightforward tasks (4K tokens)
 * - medium: Standard thinking for moderate complexity (10K tokens)
 * - high: Deep thinking for complex problems (20K tokens)
 */
exports.ANTHROPIC_THINKING_BUDGETS = {
    off: 0,
    low: 4000,
    medium: 10000,
    high: 20000,
};
/**
 * OpenAI reasoning_effort mapping
 *
 * Maps our unified levels to OpenAI's reasoningEffort parameter
 * (used by o1, o3-mini, gpt-5, etc.)
 */
exports.OPENAI_REASONING_EFFORT = {
    off: undefined,
    low: "low",
    medium: "medium",
    high: "high",
};
//# sourceMappingURL=thinking.js.map
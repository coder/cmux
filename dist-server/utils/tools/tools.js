"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getToolsForModel = getToolsForModel;
const anthropic_1 = require("@ai-sdk/anthropic");
const openai_1 = require("@ai-sdk/openai");
const google_1 = require("@ai-sdk/google");
const file_read_1 = require("../../services/tools/file_read");
const bash_1 = require("../../services/tools/bash");
const file_edit_replace_1 = require("../../services/tools/file_edit_replace");
const file_edit_insert_1 = require("../../services/tools/file_edit_insert");
const propose_plan_1 = require("../../services/tools/propose_plan");
const compact_summary_1 = require("../../services/tools/compact_summary");
const log_1 = require("../../services/log");
/**
 * Get tools available for a specific model with configuration
 * @param modelString The model string in format "provider:model-id"
 * @param config Required configuration for tools
 * @returns Record of tools available for the model
 */
function getToolsForModel(modelString, config) {
    const [provider, modelId] = modelString.split(":");
    // Base tools available for all models
    const baseTools = {
        // Use snake_case for tool names to match what seems to be the convention.
        file_read: (0, file_read_1.createFileReadTool)(config),
        file_edit_replace: (0, file_edit_replace_1.createFileEditReplaceTool)(config),
        file_edit_insert: (0, file_edit_insert_1.createFileEditInsertTool)(config),
        bash: (0, bash_1.createBashTool)(config),
        propose_plan: (0, propose_plan_1.createProposePlanTool)(config),
        compact_summary: (0, compact_summary_1.createCompactSummaryTool)(config),
    };
    // Try to add provider-specific web search tools if available
    // This doesn't break if the provider isn't recognized
    try {
        switch (provider) {
            case "anthropic":
                return {
                    ...baseTools,
                    web_search: anthropic_1.anthropic.tools.webSearch_20250305({ maxUses: 1000 }),
                };
            case "openai":
                // Only add web search for models that support it
                if (modelId.includes("gpt-5") || modelId.includes("gpt-4")) {
                    return {
                        ...baseTools,
                        web_search: openai_1.openai.tools.webSearch({
                            searchContextSize: "high",
                        }),
                    };
                }
                break;
            case "google":
                return {
                    ...baseTools,
                    google_search: google_1.google.tools.googleSearch({}),
                };
        }
    }
    catch (error) {
        // If tools aren't available, just return base tools
        log_1.log.error(`No web search tools available for ${provider}:`, error);
    }
    return baseTools;
}
//# sourceMappingURL=tools.js.map
"use strict";
/**
 * Model configuration and constants
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultModel = void 0;
exports.getModelName = getModelName;
exports.defaultModel = "anthropic:claude-sonnet-4-5";
/**
 * Extract the model name from a model string (e.g., "anthropic:claude-sonnet-4-5" -> "claude-sonnet-4-5")
 * @param modelString - Full model string in format "provider:model-name"
 * @returns The model name part (after the colon), or the full string if no colon is found
 */
function getModelName(modelString) {
    const colonIndex = modelString.indexOf(":");
    if (colonIndex === -1) {
        return modelString;
    }
    return modelString.substring(colonIndex + 1);
}
//# sourceMappingURL=models.js.map
/**
 * Model configuration and constants
 */

export const defaultModel = "anthropic:claude-sonnet-4-5";

/**
 * Extract the model name from a model string (e.g., "anthropic:claude-sonnet-4-5" -> "claude-sonnet-4-5")
 * @param modelString - Full model string in format "provider:model-name"
 * @returns The model name part (after the colon), or the full string if no colon is found
 */
export function getModelName(modelString: string): string {
  const colonIndex = modelString.indexOf(":");
  if (colonIndex === -1) {
    return modelString;
  }
  return modelString.substring(colonIndex + 1);
}

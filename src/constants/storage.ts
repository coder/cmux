/**
 * LocalStorage Key Constants and Helpers
 * These keys are used for persisting state in localStorage
 */

/**
 * Helper to create a thinking level storage key for a workspace
 * Format: "thinkingLevel:{workspaceId}"
 */
export const getThinkingLevelKey = (workspaceId: string): string => `thinkingLevel:${workspaceId}`;

/**
 * Get the localStorage key for the user's preferred model for a workspace
 */
export function getModelKey(workspaceId: string): string {
  return `model:${workspaceId}`;
}

/**
 * Get the localStorage key for the input text for a workspace
 */
export function getInputKey(workspaceId: string): string {
  return `input:${workspaceId}`;
}

/**
 * Get the localStorage key for auto-retry preference for a workspace
 */
export function getAutoRetryKey(workspaceId: string): string {
  return `${workspaceId}-autoRetry`;
}

/**
 * Get the localStorage key for retry state for a workspace
 * Stores: { attempt, totalRetryTime, retryStartTime }
 */
export function getRetryStateKey(workspaceId: string): string {
  return `${workspaceId}-retryState`;
}

/**
 * Get the localStorage key for the last active thinking level used for a model
 * Stores only active levels ("low" | "medium" | "high"), never "off"
 * Format: "lastThinkingByModel:{modelName}"
 */
export function getLastThinkingByModelKey(modelName: string): string {
  return `lastThinkingByModel:${modelName}`;
}

/**
 * Get the localStorage key for the UI mode for a workspace
 * Format: "mode:{workspaceId}"
 */
export function getModeKey(workspaceId: string): string {
  return `mode:${workspaceId}`;
}

/**
 * Get the localStorage key for the 1M context preference (global)
 * Format: "use1MContext"
 */
export const USE_1M_CONTEXT_KEY = "use1MContext";

/**
 * Get the localStorage key for the compact continue message for a workspace
 * Temporarily stores the continuation prompt for the current compaction
 * Should be deleted immediately after use to prevent bugs
 */
export function getCompactContinueMessageKey(workspaceId: string): string {
  return `compactContinueMessage:${workspaceId}`;
}

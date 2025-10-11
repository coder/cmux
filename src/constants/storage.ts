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
 * Get the localStorage key for tracking last-read timestamp for a workspace
 * Used to determine unread message status
 * Format: "lastRead:{workspaceId}"
 */
export function getLastReadKey(workspaceId: string): string {
  return `lastRead:${workspaceId}`;
}

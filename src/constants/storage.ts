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
 * Get storage key for cancelled compaction tracking.
 * Stores compaction-request user message ID to verify freshness across reloads.
 */
export function getCancelledCompactionKey(workspaceId: string): string {
  return `workspace:${workspaceId}:cancelled-compaction`;
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
 * Get the localStorage key for the preferred compaction model (global)
 * Format: "preferredCompactionModel"
 */
export const PREFERRED_COMPACTION_MODEL_KEY = "preferredCompactionModel";

/**
 * Get the localStorage key for the compact continue message for a workspace
 * Temporarily stores the continuation prompt for the current compaction
 * Should be deleted immediately after use to prevent bugs
 */
export function getCompactContinueMessageKey(workspaceId: string): string {
  return `compactContinueMessage:${workspaceId}`;
}

/**
 * Get the localStorage key for hunk expand/collapse state in Review tab
 * Stores user's manual expand/collapse preferences per hunk
 * Format: "reviewExpandState:{workspaceId}"
 */
export function getReviewExpandStateKey(workspaceId: string): string {
  return `reviewExpandState:${workspaceId}`;
}

/**
 * Get the localStorage key for FileTree expand/collapse state in Review tab
 * Stores directory expand/collapse preferences per workspace
 * Format: "fileTreeExpandState:{workspaceId}"
 */
export function getFileTreeExpandStateKey(workspaceId: string): string {
  return `fileTreeExpandState:${workspaceId}`;
}

/**
 * Get the localStorage key for unified Review search state per workspace
 * Stores: { input: string, useRegex: boolean, matchCase: boolean }
 * Format: "reviewSearchState:{workspaceId}"
 */
export function getReviewSearchStateKey(workspaceId: string): string {
  return `reviewSearchState:${workspaceId}`;
}

/**
 * List of workspace-scoped key functions that should be copied on fork and deleted on removal
 * Note: Excludes ephemeral keys like getCompactContinueMessageKey
 */
const PERSISTENT_WORKSPACE_KEY_FUNCTIONS: Array<(workspaceId: string) => string> = [
  getModelKey,
  getInputKey,
  getModeKey,
  getThinkingLevelKey,
  getAutoRetryKey,
  getRetryStateKey,
  getReviewExpandStateKey,
  getFileTreeExpandStateKey,
  getReviewSearchStateKey,
];

/**
 * Additional ephemeral keys to delete on workspace removal (not copied on fork)
 */
const EPHEMERAL_WORKSPACE_KEY_FUNCTIONS: Array<(workspaceId: string) => string> = [
  getCancelledCompactionKey,
  getCompactContinueMessageKey,
];

/**
 * Copy all workspace-specific localStorage keys from source to destination workspace
 * This includes: model, input, mode, thinking level, auto-retry, retry state, review expand state, file tree expand state
 */
export function copyWorkspaceStorage(sourceWorkspaceId: string, destWorkspaceId: string): void {
  for (const getKey of PERSISTENT_WORKSPACE_KEY_FUNCTIONS) {
    const sourceKey = getKey(sourceWorkspaceId);
    const destKey = getKey(destWorkspaceId);
    const value = localStorage.getItem(sourceKey);
    if (value !== null) {
      localStorage.setItem(destKey, value);
    }
  }
}

/**
 * Delete all workspace-specific localStorage keys for a workspace
 * Should be called when a workspace is deleted to prevent orphaned data
 */
export function deleteWorkspaceStorage(workspaceId: string): void {
  const allKeyFunctions = [
    ...PERSISTENT_WORKSPACE_KEY_FUNCTIONS,
    ...EPHEMERAL_WORKSPACE_KEY_FUNCTIONS,
  ];

  for (const getKey of allKeyFunctions) {
    const key = getKey(workspaceId);
    localStorage.removeItem(key);
  }
}

/**
 * LocalStorage Key Constants and Helpers
 * These keys are used for persisting state in localStorage
 */

/**
 * Helper to create a thinking level storage key for a workspace
 * Format: "thinkingLevel:{workspaceId}"
 */
export const getThinkingLevelKey = (workspaceId: string): string => `thinkingLevel:${workspaceId}`;

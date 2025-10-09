/**
 * Centralized localStorage key generation for workspace-scoped data
 * 
 * This prevents key mismatch bugs where different components use different
 * key formats for the same data (e.g., "model:workspace-123" vs "workspace-123-model").
 * 
 * All workspace-scoped localStorage keys should be generated through these functions.
 */

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

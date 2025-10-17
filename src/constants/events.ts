/**
 * Custom Event Constants
 * These are window-level custom events used for cross-component communication
 */

export const CUSTOM_EVENTS = {
  /**
   * Event to show a toast notification when thinking level changes
   * Detail: { workspaceId: string, level: ThinkingLevel }
   */
  THINKING_LEVEL_TOAST: "cmux:thinkingLevelToast",

  /**
   * Event to insert text into the chat input
   * Detail: { text: string }
   */
  INSERT_TO_CHAT_INPUT: "cmux:insertToChatInput",

  /**
   * Event to open the model selector
   * No detail
   */
  OPEN_MODEL_SELECTOR: "cmux:openModelSelector",

  /**
   * Event to trigger resume check for a workspace
   * Detail: { workspaceId: string }
   *
   * Emitted when:
   * - Stream error occurs
   * - Stream aborted
   * - App startup (for all workspaces with interrupted streams)
   *
   * useResumeManager handles this idempotently - safe to emit multiple times
   */
  RESUME_CHECK_REQUESTED: "cmux:resumeCheckRequested",

  /**
   * Event to switch to a different workspace after fork
   * Detail: { workspaceId: string, projectPath: string, projectName: string, workspacePath: string, branch: string }
   */
  WORKSPACE_FORK_SWITCH: "cmux:workspaceForkSwitch",
} as const;

/**
 * Helper to create a storage change event name for a specific key
 * Used by usePersistedState for same-tab synchronization
 */
export const getStorageChangeEvent = (key: string): string => `storage-change:${key}`;

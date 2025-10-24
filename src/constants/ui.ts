/**
 * UI-related constants shared across components
 */

/**
 * Emoji used for compacted/start-here functionality throughout the app.
 * Used in:
 * - AssistantMessage compacted badge
 * - Start Here button (plans and assistant messages)
 */
export const COMPACTED_EMOJI = "📦";

/**
 * Prefix for file write denial error messages.
 * This constant is duplicated from services/tools/fileCommon.ts for frontend use.
 * Must stay in sync with backend definition.
 */
export const WRITE_DENIED_PREFIX = "WRITE DENIED, FILE UNMODIFIED:";

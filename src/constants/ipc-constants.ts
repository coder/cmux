/**
 * IPC Channel Constants - Shared between main and preload processes
 * This file contains only constants and helper functions, no Electron-specific code
 */

export const IPC_CHANNELS = {
  // Config channels
  CONFIG_LOAD: "config:load",
  CONFIG_SAVE: "config:save",

  // Dialog channels
  DIALOG_SELECT_DIR: "dialog:selectDirectory",

  // Provider channels
  PROVIDERS_SET_CONFIG: "providers:setConfig",
  PROVIDERS_LIST: "providers:list",

  // Workspace channels
  // NOTE: Prefer discriminated unions over creating separate channels for related operations
  // to prevent constant bloat (e.g., use WORKSPACE_TODO with operation type, not TODO_ADD/REMOVE/TOGGLE)
  WORKSPACE_LIST: "workspace:list",
  WORKSPACE_CREATE: "workspace:create",
  WORKSPACE_REMOVE: "workspace:remove",
  WORKSPACE_RENAME: "workspace:rename",
  WORKSPACE_STREAM_META: "workspace:streamMeta",
  WORKSPACE_SEND_MESSAGE: "workspace:sendMessage",
  WORKSPACE_TRUNCATE_HISTORY: "workspace:truncateHistory",
  WORKSPACE_REPLACE_HISTORY: "workspace:replaceHistory",
  WORKSPACE_STREAM_HISTORY: "workspace:streamHistory",
  WORKSPACE_GET_INFO: "workspace:getInfo",
  WORKSPACE_EXECUTE_BASH: "workspace:executeBash",
  WORKSPACE_TODO: "workspace:todo",

  // Dynamic channel prefixes
  WORKSPACE_CHAT_PREFIX: "workspace:chat:",
  WORKSPACE_METADATA: "workspace:metadata",
  WORKSPACE_METADATA_SUBSCRIBE: "workspace:metadata:subscribe",
} as const;

// Helper functions for dynamic channels
export const getChatChannel = (workspaceId: string): string =>
  `${IPC_CHANNELS.WORKSPACE_CHAT_PREFIX}${workspaceId}`;

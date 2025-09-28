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

  // Workspace channels
  WORKSPACE_LIST: "workspace:list",
  WORKSPACE_CREATE: "workspace:create",
  WORKSPACE_REMOVE: "workspace:remove",
  WORKSPACE_STREAM_META: "workspace:streamMeta",
  WORKSPACE_SEND_MESSAGE: "workspace:sendMessage",
  WORKSPACE_CLEAR_HISTORY: "workspace:clearHistory",
  WORKSPACE_STREAM_HISTORY: "workspace:streamHistory",
  WORKSPACE_GET_INFO: "workspace:getInfo",

  // Dynamic channel prefixes
  WORKSPACE_OUTPUT_PREFIX: "workspace:output:",
  WORKSPACE_CLEAR_PREFIX: "workspace:clear:",
  WORKSPACE_METADATA: "workspace:metadata",
} as const;

// Helper functions for dynamic channels
export const getOutputChannel = (workspaceId: string): string =>
  `${IPC_CHANNELS.WORKSPACE_OUTPUT_PREFIX}${workspaceId}`;

export const getClearChannel = (workspaceId: string): string =>
  `${IPC_CHANNELS.WORKSPACE_CLEAR_PREFIX}${workspaceId}`;

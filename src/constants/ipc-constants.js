/**
 * IPC Channel Constants
 * This is the single source of truth for all IPC channel names.
 * Using plain JavaScript so it can be easily imported in TypeScript
 * and required in the preload script without module resolution issues.
 */

const IPC_CHANNELS = {
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
  WORKSPACE_SET_PERMISSION: "workspace:setPermission",
  WORKSPACE_SEND_MESSAGE: "workspace:sendMessage",
  WORKSPACE_HANDLE_SLASH: "workspace:handleSlash",
  WORKSPACE_STREAM_HISTORY: "workspace:streamHistory",
  WORKSPACE_GET_INFO: "workspace:getInfo",

  // Dynamic channel prefixes
  WORKSPACE_OUTPUT_PREFIX: "workspace:output:",
  WORKSPACE_CLEAR_PREFIX: "workspace:clear:",
  WORKSPACE_METADATA: "workspace:metadata",
};

// Helper functions for dynamic channels
const getOutputChannel = (workspaceId) => `${IPC_CHANNELS.WORKSPACE_OUTPUT_PREFIX}${workspaceId}`;

const getClearChannel = (workspaceId) => `${IPC_CHANNELS.WORKSPACE_CLEAR_PREFIX}${workspaceId}`;

// Export for CommonJS (preload) and ES modules (TypeScript)
module.exports = {
  IPC_CHANNELS,
  getOutputChannel,
  getClearChannel,
};

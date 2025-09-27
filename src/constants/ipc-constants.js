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

  // Git channels
  GIT_CREATE_WORKTREE: "git:createWorktree",
  GIT_REMOVE_WORKTREE: "git:removeWorktree",

  // Claude channels
  CLAUDE_LIST: "claude:list",
  CLAUDE_STREAM_META: "claude:streamWorkspaceMeta",
  CLAUDE_SET_PERMISSION: "claude:setPermissionMode",
  CLAUDE_SEND_MESSAGE: "claude:sendMessage",
  CLAUDE_HANDLE_SLASH: "claude:handleSlashCommand",
  CLAUDE_STREAM_HISTORY: "claude:streamHistory",
  CLAUDE_REMOVE_WORKSPACE: "claude:removeWorkspace",
  CLAUDE_GET_WORKSPACE_INFO: "claude:getWorkspaceInfo",

  // Dynamic channel prefixes
  CLAUDE_OUTPUT_PREFIX: "claude:output:",
  CLAUDE_CLEAR_PREFIX: "claude:clear:",
  CLAUDE_METADATA: "claude:metadata",
};

// Helper functions for dynamic channels
const getOutputChannel = (workspaceId) => `${IPC_CHANNELS.CLAUDE_OUTPUT_PREFIX}${workspaceId}`;

const getClearChannel = (workspaceId) => `${IPC_CHANNELS.CLAUDE_CLEAR_PREFIX}${workspaceId}`;

// Export for CommonJS (preload) and ES modules (TypeScript)
module.exports = {
  IPC_CHANNELS,
  getOutputChannel,
  getClearChannel,
};

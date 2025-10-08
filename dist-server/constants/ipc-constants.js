"use strict";
/**
 * IPC Channel Constants - Shared between main and preload processes
 * This file contains only constants and helper functions, no Electron-specific code
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatChannel = exports.IPC_CHANNELS = void 0;
exports.IPC_CHANNELS = {
    // Config channels
    CONFIG_LOAD: "config:load",
    CONFIG_SAVE: "config:save",
    // Dialog channels
    DIALOG_SELECT_DIR: "dialog:selectDirectory",
    // Provider channels
    PROVIDERS_SET_CONFIG: "providers:setConfig",
    PROVIDERS_LIST: "providers:list",
    // Workspace channels
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
    WORKSPACE_OPEN_TERMINAL: "workspace:openTerminal",
    // Dynamic channel prefixes
    WORKSPACE_CHAT_PREFIX: "workspace:chat:",
    WORKSPACE_METADATA: "workspace:metadata",
    WORKSPACE_METADATA_SUBSCRIBE: "workspace:metadata:subscribe",
};
// Helper functions for dynamic channels
const getChatChannel = (workspaceId) => `${exports.IPC_CHANNELS.WORKSPACE_CHAT_PREFIX}${workspaceId}`;
exports.getChatChannel = getChatChannel;
//# sourceMappingURL=ipc-constants.js.map
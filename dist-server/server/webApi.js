"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webApi = void 0;
const ipc_constants_1 = require("../constants/ipc-constants");
const API_BASE = typeof window !== "undefined"
    ? (window.location.protocol === "file:"
        ? "http://localhost:3000"
        : `${window.location.protocol}//${window.location.host}`)
    : "http://localhost:3000";
const WS_BASE = API_BASE.replace("http://", "ws://").replace("https://", "wss://");
// Helper function to invoke IPC handlers via HTTP
async function invokeIPC(channel, ...args) {
    const response = await fetch(`${API_BASE}/ipc/${channel}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ args }),
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || "Unknown error");
    }
    return result.data;
}
// WebSocket connection manager
class WebSocketManager {
    ws = null;
    reconnectTimer = null;
    messageHandlers = new Map();
    isConnecting = false;
    shouldReconnect = true;
    connect() {
        if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
            return;
        }
        this.isConnecting = true;
        this.ws = new WebSocket(`${WS_BASE}/ws`);
        this.ws.onopen = () => {
            console.log("WebSocket connected");
            this.isConnecting = false;
            // Resubscribe to all channels
            for (const channel of this.messageHandlers.keys()) {
                this.subscribe(channel);
            }
        };
        this.ws.onmessage = (event) => {
            try {
                const { channel, args } = JSON.parse(event.data);
                const handlers = this.messageHandlers.get(channel);
                if (handlers) {
                    handlers.forEach((handler) => handler(args[0]));
                }
            }
            catch (error) {
                console.error("Error handling WebSocket message:", error);
            }
        };
        this.ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            this.isConnecting = false;
        };
        this.ws.onclose = () => {
            console.log("WebSocket disconnected");
            this.isConnecting = false;
            this.ws = null;
            // Attempt to reconnect after a delay
            if (this.shouldReconnect) {
                this.reconnectTimer = setTimeout(() => this.connect(), 2000);
            }
        };
    }
    subscribe(channel, workspaceId) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            if (channel.startsWith(ipc_constants_1.IPC_CHANNELS.WORKSPACE_CHAT_PREFIX)) {
                this.ws.send(JSON.stringify({
                    type: "subscribe",
                    channel: "workspace:chat",
                    workspaceId,
                }));
            }
            else if (channel === ipc_constants_1.IPC_CHANNELS.WORKSPACE_METADATA) {
                this.ws.send(JSON.stringify({
                    type: "subscribe",
                    channel: "workspace:metadata",
                }));
            }
        }
    }
    unsubscribe(channel, workspaceId) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            if (channel.startsWith(ipc_constants_1.IPC_CHANNELS.WORKSPACE_CHAT_PREFIX)) {
                this.ws.send(JSON.stringify({
                    type: "unsubscribe",
                    channel: "workspace:chat",
                    workspaceId,
                }));
            }
            else if (channel === ipc_constants_1.IPC_CHANNELS.WORKSPACE_METADATA) {
                this.ws.send(JSON.stringify({
                    type: "unsubscribe",
                    channel: "workspace:metadata",
                }));
            }
        }
    }
    on(channel, handler, workspaceId) {
        if (!this.messageHandlers.has(channel)) {
            this.messageHandlers.set(channel, new Set());
            this.connect();
            this.subscribe(channel, workspaceId);
        }
        const handlers = this.messageHandlers.get(channel);
        handlers.add(handler);
        // Return unsubscribe function
        return () => {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.messageHandlers.delete(channel);
                this.unsubscribe(channel, workspaceId);
            }
        };
    }
    disconnect() {
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
const wsManager = new WebSocketManager();
// Create the Web API implementation
exports.webApi = {
    config: {
        load: () => invokeIPC(ipc_constants_1.IPC_CHANNELS.CONFIG_LOAD),
        save: (config) => invokeIPC(ipc_constants_1.IPC_CHANNELS.CONFIG_SAVE, config),
    },
    dialog: {
        selectDirectory: () => invokeIPC(ipc_constants_1.IPC_CHANNELS.DIALOG_SELECT_DIR),
    },
    providers: {
        setProviderConfig: (provider, keyPath, value) => invokeIPC(ipc_constants_1.IPC_CHANNELS.PROVIDERS_SET_CONFIG, provider, keyPath, value),
        list: () => invokeIPC(ipc_constants_1.IPC_CHANNELS.PROVIDERS_LIST),
    },
    workspace: {
        list: () => invokeIPC(ipc_constants_1.IPC_CHANNELS.WORKSPACE_LIST),
        create: (projectPath, branchName) => invokeIPC(ipc_constants_1.IPC_CHANNELS.WORKSPACE_CREATE, projectPath, branchName),
        remove: (workspaceId) => invokeIPC(ipc_constants_1.IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId),
        rename: (workspaceId, newName) => invokeIPC(ipc_constants_1.IPC_CHANNELS.WORKSPACE_RENAME, workspaceId, newName),
        sendMessage: (workspaceId, message, options) => invokeIPC(ipc_constants_1.IPC_CHANNELS.WORKSPACE_SEND_MESSAGE, workspaceId, message, options),
        truncateHistory: (workspaceId, percentage) => invokeIPC(ipc_constants_1.IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY, workspaceId, percentage),
        replaceChatHistory: (workspaceId, summaryMessage) => invokeIPC(ipc_constants_1.IPC_CHANNELS.WORKSPACE_REPLACE_HISTORY, workspaceId, summaryMessage),
        getInfo: (workspaceId) => invokeIPC(ipc_constants_1.IPC_CHANNELS.WORKSPACE_GET_INFO, workspaceId),
        executeBash: (workspaceId, script, options) => invokeIPC(ipc_constants_1.IPC_CHANNELS.WORKSPACE_EXECUTE_BASH, workspaceId, script, options),
        openTerminal: (workspacePath) => invokeIPC(ipc_constants_1.IPC_CHANNELS.WORKSPACE_OPEN_TERMINAL, workspacePath),
        onChat: (workspaceId, callback) => {
            const channel = (0, ipc_constants_1.getChatChannel)(workspaceId);
            return wsManager.on(channel, callback, workspaceId);
        },
        onMetadata: (callback) => {
            return wsManager.on(ipc_constants_1.IPC_CHANNELS.WORKSPACE_METADATA, callback);
        },
    },
};
// Cleanup on page unload
if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
        wsManager.disconnect();
    });
}
//# sourceMappingURL=webApi.js.map
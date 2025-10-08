/**
 * Web API Client - Replaces Electron IPC with HTTP/WebSocket calls
 * This is used by the renderer when running in web mode (mobile)
 */
import type { IPCApi, WorkspaceChatMessage } from "../types/ipc";
import { IPC_CHANNELS, getChatChannel } from "../constants/ipc-constants";

const API_BASE = typeof window !== "undefined" 
  ? (window.location.protocol === "file:" 
    ? "http://localhost:3000" 
    : `${window.location.protocol}//${window.location.host}`)
  : "http://localhost:3000";

const WS_BASE = API_BASE.replace("http://", "ws://").replace("https://", "wss://");

interface InvokeResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Helper function to invoke IPC handlers via HTTP
async function invokeIPC<T>(channel: string, ...args: unknown[]): Promise<T> {
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

  const result: InvokeResponse<T> = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Unknown error");
  }

  return result.data as T;
}

// WebSocket connection manager
class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers = new Map<string, Set<(data: unknown) => void>>();
  private isConnecting = false;
  private shouldReconnect = true;

  connect(): void {
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
      } catch (error) {
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

  subscribe(channel: string, workspaceId?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (channel.startsWith(IPC_CHANNELS.WORKSPACE_CHAT_PREFIX)) {
        this.ws.send(
          JSON.stringify({
            type: "subscribe",
            channel: "workspace:chat",
            workspaceId,
          })
        );
      } else if (channel === IPC_CHANNELS.WORKSPACE_METADATA) {
        this.ws.send(
          JSON.stringify({
            type: "subscribe",
            channel: "workspace:metadata",
          })
        );
      }
    }
  }

  unsubscribe(channel: string, workspaceId?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (channel.startsWith(IPC_CHANNELS.WORKSPACE_CHAT_PREFIX)) {
        this.ws.send(
          JSON.stringify({
            type: "unsubscribe",
            channel: "workspace:chat",
            workspaceId,
          })
        );
      } else if (channel === IPC_CHANNELS.WORKSPACE_METADATA) {
        this.ws.send(
          JSON.stringify({
            type: "unsubscribe",
            channel: "workspace:metadata",
          })
        );
      }
    }
  }

  on(channel: string, handler: (data: unknown) => void, workspaceId?: string): () => void {
    if (!this.messageHandlers.has(channel)) {
      this.messageHandlers.set(channel, new Set());
      this.connect();
      this.subscribe(channel, workspaceId);
    }

    const handlers = this.messageHandlers.get(channel)!;
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

  disconnect(): void {
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
export const webApi: IPCApi = {
  config: {
    load: () => invokeIPC(IPC_CHANNELS.CONFIG_LOAD),
    save: (config) => invokeIPC(IPC_CHANNELS.CONFIG_SAVE, config),
  },
  dialog: {
    selectDirectory: () => invokeIPC(IPC_CHANNELS.DIALOG_SELECT_DIR),
  },
  providers: {
    setProviderConfig: (provider, keyPath, value) =>
      invokeIPC(IPC_CHANNELS.PROVIDERS_SET_CONFIG, provider, keyPath, value),
    list: () => invokeIPC(IPC_CHANNELS.PROVIDERS_LIST),
  },
  workspace: {
    list: () => invokeIPC(IPC_CHANNELS.WORKSPACE_LIST),
    create: (projectPath, branchName) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_CREATE, projectPath, branchName),
    remove: (workspaceId: string) => invokeIPC(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId),
    rename: (workspaceId: string, newName: string) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_RENAME, workspaceId, newName),
    sendMessage: (workspaceId, message, options) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_SEND_MESSAGE, workspaceId, message, options),
    truncateHistory: (workspaceId, percentage) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY, workspaceId, percentage),
    replaceChatHistory: (workspaceId, summaryMessage) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_REPLACE_HISTORY, workspaceId, summaryMessage),
    getInfo: (workspaceId) => invokeIPC(IPC_CHANNELS.WORKSPACE_GET_INFO, workspaceId),
    executeBash: (workspaceId, script, options) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_EXECUTE_BASH, workspaceId, script, options),
    openTerminal: (workspacePath) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_OPEN_TERMINAL, workspacePath),

    onChat: (workspaceId, callback) => {
      const channel = getChatChannel(workspaceId);
      return wsManager.on(channel, callback as (data: unknown) => void, workspaceId);
    },

    onMetadata: (callback) => {
      return wsManager.on(
        IPC_CHANNELS.WORKSPACE_METADATA,
        callback as (data: unknown) => void
      );
    },
  },
};

// Cleanup on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    wsManager.disconnect();
  });
}

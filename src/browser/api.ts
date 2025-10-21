/**
 * Browser API client. Used when running cmux in server mode.
 */
import { IPC_CHANNELS, getChatChannel } from "@/constants/ipc-constants";
import type { IPCApi } from "@/types/ipc";

const API_BASE = window.location.origin;
const WS_BASE = API_BASE.replace("http://", "ws://").replace("https://", "wss://");

interface InvokeResponse<T> {
  success: boolean;
  data?: T;
  error?: unknown; // Can be string or structured error object
}

// Helper function to invoke IPC handlers via HTTP
async function invokeIPC<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = await fetch(`${API_BASE}/ipc/${encodeURIComponent(channel)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ args }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = (await response.json()) as InvokeResponse<T> | T;

  // If result is a Result type (has success field), return it as-is
  // This handles operations like sendMessage that return Result<T, E>
  if (result && typeof result === "object" && "success" in result && typeof result.success === "boolean") {
    return result as T;
  }

  // For wrapped responses, check if they're successful
  const wrappedResult = result as InvokeResponse<T>;
  if ("success" in wrappedResult) {
    if (!wrappedResult.success) {
      throw new Error(
        typeof wrappedResult.error === "string" ? wrappedResult.error : "Unknown error"
      );
    }
    return wrappedResult.data as T;
  }

  // Direct return value (shouldn't happen with current server implementation)
  return result as T;
}

// WebSocket connection manager
class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers = new Map<string, Set<(data: unknown) => void>>();
  private channelWorkspaceIds = new Map<string, string>(); // Track workspaceId for each channel
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

      // Resubscribe to all channels with their workspace IDs
      for (const channel of this.messageHandlers.keys()) {
        const workspaceId = this.channelWorkspaceIds.get(channel);
        this.subscribe(channel, workspaceId);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as { channel: string; args: unknown[] };
        const { channel, args } = parsed;
        const handlers = this.messageHandlers.get(channel);
        if (handlers && args.length > 0) {
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
        console.log(
          `[WebSocketManager] Subscribing to workspace chat for workspaceId: ${workspaceId ?? "undefined"}`
        );
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
      // Store workspaceId for this channel (needed for reconnection)
      if (workspaceId) {
        this.channelWorkspaceIds.set(channel, workspaceId);
      }
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
        this.channelWorkspaceIds.delete(channel);
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

// Directory selection via custom event (for browser mode)
interface DirectorySelectEvent extends CustomEvent {
  detail: {
    resolve: (path: string | null) => void;
  };
}

function requestDirectorySelection(): Promise<string | null> {
  return new Promise((resolve) => {
    const event = new CustomEvent("directory-select-request", {
      detail: { resolve },
    }) as DirectorySelectEvent;
    window.dispatchEvent(event);
  });
}

// Create the Web API implementation
const webApi: IPCApi = {
  dialog: {
    selectDirectory: requestDirectorySelection,
  },
  providers: {
    setProviderConfig: (provider, keyPath, value) =>
      invokeIPC(IPC_CHANNELS.PROVIDERS_SET_CONFIG, provider, keyPath, value),
    list: () => invokeIPC(IPC_CHANNELS.PROVIDERS_LIST),
  },
  projects: {
    create: (projectPath) => invokeIPC(IPC_CHANNELS.PROJECT_CREATE, projectPath),
    remove: (projectPath) => invokeIPC(IPC_CHANNELS.PROJECT_REMOVE, projectPath),
    list: () => invokeIPC(IPC_CHANNELS.PROJECT_LIST),
    listBranches: (projectPath) => invokeIPC(IPC_CHANNELS.PROJECT_LIST_BRANCHES, projectPath),
    secrets: {
      get: (projectPath) => invokeIPC(IPC_CHANNELS.PROJECT_SECRETS_GET, projectPath),
      update: (projectPath, secrets) =>
        invokeIPC(IPC_CHANNELS.PROJECT_SECRETS_UPDATE, projectPath, secrets),
    },
  },
  workspace: {
    list: () => invokeIPC(IPC_CHANNELS.WORKSPACE_LIST),
    create: (projectPath, branchName, trunkBranch) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_CREATE, projectPath, branchName, trunkBranch),
    remove: (workspaceId, options) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId, options),
    rename: (workspaceId, newName) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_RENAME, workspaceId, newName),
    fork: (sourceWorkspaceId, newName) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_FORK, sourceWorkspaceId, newName),
    sendMessage: (workspaceId, message, options) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_SEND_MESSAGE, workspaceId, message, options),
    resumeStream: (workspaceId, options) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_RESUME_STREAM, workspaceId, options),
    interruptStream: (workspaceId, options) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_INTERRUPT_STREAM, workspaceId, options),
    truncateHistory: (workspaceId, percentage) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY, workspaceId, percentage),
    replaceChatHistory: (workspaceId, summaryMessage) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_REPLACE_HISTORY, workspaceId, summaryMessage),
    getInfo: (workspaceId) => invokeIPC(IPC_CHANNELS.WORKSPACE_GET_INFO, workspaceId),
    executeBash: (workspaceId, script, options) =>
      invokeIPC(IPC_CHANNELS.WORKSPACE_EXECUTE_BASH, workspaceId, script, options),
    openTerminal: (workspacePath) => invokeIPC(IPC_CHANNELS.WORKSPACE_OPEN_TERMINAL, workspacePath),

    onChat: (workspaceId, callback) => {
      const channel = getChatChannel(workspaceId);
      return wsManager.on(channel, callback as (data: unknown) => void, workspaceId);
    },

    onMetadata: (callback) => {
      return wsManager.on(IPC_CHANNELS.WORKSPACE_METADATA, callback as (data: unknown) => void);
    },
  },
  window: {
    setTitle: (title) => {
      document.title = title;
      return Promise.resolve();
    },
  },
  update: {
    check: () => invokeIPC(IPC_CHANNELS.UPDATE_CHECK),
    download: () => invokeIPC(IPC_CHANNELS.UPDATE_DOWNLOAD),
    install: () => {
      // Install is a one-way call that doesn't wait for response
      void invokeIPC(IPC_CHANNELS.UPDATE_INSTALL);
    },
    onStatus: (callback) => {
      return wsManager.on(IPC_CHANNELS.UPDATE_STATUS, callback as (data: unknown) => void);
    },
  },
};

if (typeof window.api === "undefined") {
  // @ts-expect-error - Assigning to window.api which is not in TypeScript types
  window.api = webApi;
}

window.addEventListener("beforeunload", () => {
  wsManager.disconnect();
});

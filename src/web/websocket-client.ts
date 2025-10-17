/**
 * WebSocket Client Adapter
 * 
 * Replaces Electron IPC with WebSocket communication.
 * Provides same API as preload script for seamless integration.
 */

import type { IPCApi } from '../types/ipc';
import { IPC_CHANNELS, getChatChannel } from '../constants/ipc-constants';

interface WebSocketMessage {
  id: string;
  type: 'request' | 'response' | 'event';
  channel?: string;
  method?: string;
  args?: unknown[];
  result?: unknown;
  error?: string;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
  private eventHandlers = new Map<string, Set<(data: unknown) => void>>();
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY = 1000;
  private token: string | null = null;

  public async connect(token: string): Promise<void> {
    this.token = token;
    return this.createConnection();
  }

  private async createConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.getWebSocketUrl();
      console.log('Connecting to WebSocket:', wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.handleReconnect();
      };
    });
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws?token=${this.token}`;
  }

  private handleMessage(message: WebSocketMessage) {
    if (message.type === 'response') {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.result);
        }
        this.pendingRequests.delete(message.id);
      }
    } else if (message.type === 'event' && message.channel) {
      const handlers = this.eventHandlers.get(message.channel);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(message.result);
          } catch (error) {
            console.error(`Event handler error for ${message.channel}:`, error);
          }
        }
      }
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    setTimeout(() => {
      if (this.token) {
        this.createConnection().catch(console.error);
      }
    }, delay);
  }

  private async request(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const message: WebSocketMessage = {
        id,
        type: 'request',
        channel,
        args,
      };

      this.ws!.send(JSON.stringify(message));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  private subscribe(channel: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(channel)) {
      this.eventHandlers.set(channel, new Set());
    }
    
    this.eventHandlers.get(channel)!.add(handler);

    // Send subscription event
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        id: `sub-${Date.now()}`,
        type: 'event',
        channel: 'subscribe',
        args: [channel],
      };
      this.ws.send(JSON.stringify(message));
    }

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(channel);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(channel);
          
          // Send unsubscribe event
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message: WebSocketMessage = {
              id: `unsub-${Date.now()}`,
              type: 'event',
              channel: 'unsubscribe',
              args: [channel],
            };
            this.ws.send(JSON.stringify(message));
          }
        }
      }
    };
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
    this.eventHandlers.clear();
  }

  // IPC-compatible API
  public createAPI(): IPCApi {
    return {
      dialog: {
        selectDirectory: () => this.request(IPC_CHANNELS.DIALOG_SELECT_DIR),
      },
      providers: {
        setProviderConfig: (provider, keyPath, value) =>
          this.request(IPC_CHANNELS.PROVIDERS_SET_CONFIG, provider, keyPath, value),
        list: () => this.request(IPC_CHANNELS.PROVIDERS_LIST),
      },
      projects: {
        create: (projectPath) => this.request(IPC_CHANNELS.PROJECT_CREATE, projectPath),
        remove: (projectPath) => this.request(IPC_CHANNELS.PROJECT_REMOVE, projectPath),
        list: () => this.request(IPC_CHANNELS.PROJECT_LIST),
        listBranches: (projectPath) => this.request(IPC_CHANNELS.PROJECT_LIST_BRANCHES, projectPath),
        secrets: {
          get: (projectPath) => this.request(IPC_CHANNELS.PROJECT_SECRETS_GET, projectPath),
          update: (projectPath, secrets) =>
            this.request(IPC_CHANNELS.PROJECT_SECRETS_UPDATE, projectPath, secrets),
        },
      },
      workspace: {
        list: () => this.request(IPC_CHANNELS.WORKSPACE_LIST),
        create: (projectPath, branchName, trunkBranch) =>
          this.request(IPC_CHANNELS.WORKSPACE_CREATE, projectPath, branchName, trunkBranch),
        remove: (workspaceId, options) =>
          this.request(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId, options),
        rename: (workspaceId, newName) =>
          this.request(IPC_CHANNELS.WORKSPACE_RENAME, workspaceId, newName),
        fork: (sourceWorkspaceId, newName) =>
          this.request(IPC_CHANNELS.WORKSPACE_FORK, sourceWorkspaceId, newName),
        sendMessage: (workspaceId, message, options) =>
          this.request(IPC_CHANNELS.WORKSPACE_SEND_MESSAGE, workspaceId, message, options),
        resumeStream: (workspaceId, options) =>
          this.request(IPC_CHANNELS.WORKSPACE_RESUME_STREAM, workspaceId, options),
        interruptStream: (workspaceId) =>
          this.request(IPC_CHANNELS.WORKSPACE_INTERRUPT_STREAM, workspaceId),
        truncateHistory: (workspaceId, percentage) =>
          this.request(IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY, workspaceId, percentage),
        replaceChatHistory: (workspaceId, summaryMessage) =>
          this.request(IPC_CHANNELS.WORKSPACE_REPLACE_HISTORY, workspaceId, summaryMessage),
        getInfo: (workspaceId) => this.request(IPC_CHANNELS.WORKSPACE_GET_INFO, workspaceId),
        executeBash: (workspaceId, script, options) =>
          this.request(IPC_CHANNELS.WORKSPACE_EXECUTE_BASH, workspaceId, script, options),
        openTerminal: (workspacePath) =>
          this.request(IPC_CHANNELS.WORKSPACE_OPEN_TERMINAL, workspacePath),
        onChat: (workspaceId, callback) => {
          const channel = getChatChannel(workspaceId);
          return this.subscribe(channel, callback as (data: unknown) => void);
        },
        onMetadata: (callback) => {
          return this.subscribe(IPC_CHANNELS.WORKSPACE_METADATA, callback as (data: unknown) => void);
        },
      },
      window: {
        setTitle: (title) => this.request(IPC_CHANNELS.WINDOW_SET_TITLE, title),
      },
      platform: navigator.platform.includes('Mac') ? 'darwin' : 
                navigator.platform.includes('Win') ? 'win32' : 'linux',
      versions: {
        node: 'N/A',
        chrome: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || 'N/A',
        electron: 'N/A (Web)',
      },
    };
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient();

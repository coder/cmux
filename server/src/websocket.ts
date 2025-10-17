/**
 * WebSocket Manager
 * 
 * Replaces Electron IPC with WebSocket-based bidirectional communication.
 * Maintains compatibility with existing IPC channel architecture.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { IpcMain } from '../../src/services/ipcMain';
import type { SessionManager } from './sessions';
import { verifyToken } from './auth';
import { IPC_CHANNELS, getChatChannel } from '../../src/constants/ipc-constants';

interface WebSocketMessage {
  id: string;
  type: 'request' | 'response' | 'event';
  channel?: string;
  method?: string;
  args?: unknown[];
  result?: unknown;
  error?: string;
}

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  sessionId?: string;
  subscriptions: Set<string>;
}

export class WebSocketManager {
  private clients = new Map<string, AuthenticatedWebSocket>();

  constructor(
    private wss: WebSocketServer,
    private ipcMain: IpcMain,
    private sessionManager: SessionManager
  ) {
    this.initialize();
  }

  private initialize() {
    this.wss.on('connection', this.handleConnection.bind(this));
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
    const authWs = ws as AuthenticatedWebSocket;
    authWs.subscriptions = new Set();

    // Extract token from query string or headers
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      ws.close(4001, 'Missing authentication token');
      return;
    }

    try {
      const decoded = verifyToken(token);
      authWs.userId = decoded.userId;
      authWs.sessionId = decoded.sessionId;
      
      this.clients.set(decoded.sessionId, authWs);
      console.log(`Client connected: user=${decoded.userId}, session=${decoded.sessionId}`);

      ws.on('message', (data) => this.handleMessage(authWs, data));
      ws.on('close', () => this.handleClose(authWs));
      ws.on('error', (error) => this.handleError(authWs, error));

      // Send connection success
      this.send(authWs, {
        id: 'connection',
        type: 'event',
        channel: 'connected',
        result: { sessionId: decoded.sessionId },
      });
    } catch (error) {
      console.error('Authentication failed:', error);
      ws.close(4002, 'Invalid authentication token');
    }
  }

  private async handleMessage(ws: AuthenticatedWebSocket, data: Buffer | ArrayBuffer | Buffer[]) {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      if (message.type === 'request') {
        await this.handleRequest(ws, message);
      } else if (message.type === 'event') {
        await this.handleEvent(ws, message);
      }
    } catch (error) {
      console.error('Failed to handle message:', error);
      this.sendError(ws, 'unknown', 'Invalid message format');
    }
  }

  private async handleRequest(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
    const { id, channel, args = [] } = message;

    try {
      // Map WebSocket requests to IPC handlers
      let result: unknown;

      switch (channel) {
        // Dialog
        case IPC_CHANNELS.DIALOG_SELECT_DIR:
          // In web mode, this would be handled client-side with file input
          result = null;
          break;

        // Projects
        case IPC_CHANNELS.PROJECT_CREATE:
          result = await this.ipcMain.handleProjectCreate(...args as [string]);
          break;
        case IPC_CHANNELS.PROJECT_REMOVE:
          result = await this.ipcMain.handleProjectRemove(...args as [string]);
          break;
        case IPC_CHANNELS.PROJECT_LIST:
          result = await this.ipcMain.handleProjectList();
          break;
        case IPC_CHANNELS.PROJECT_LIST_BRANCHES:
          result = await this.ipcMain.handleListBranches(...args as [string]);
          break;

        // Workspaces
        case IPC_CHANNELS.WORKSPACE_LIST:
          result = await this.ipcMain.handleWorkspaceList();
          break;
        case IPC_CHANNELS.WORKSPACE_CREATE:
          result = await this.ipcMain.handleWorkspaceCreate(...args as [string, string, string]);
          break;
        case IPC_CHANNELS.WORKSPACE_REMOVE:
          result = await this.ipcMain.handleWorkspaceRemove(...args as [string, { force?: boolean }?]);
          break;
        case IPC_CHANNELS.WORKSPACE_RENAME:
          result = await this.ipcMain.handleWorkspaceRename(...args as [string, string]);
          break;
        case IPC_CHANNELS.WORKSPACE_FORK:
          result = await this.ipcMain.handleWorkspaceFork(...args as [string, string]);
          break;
        case IPC_CHANNELS.WORKSPACE_SEND_MESSAGE:
          result = await this.ipcMain.handleSendMessage(...args as Parameters<typeof this.ipcMain.handleSendMessage>);
          break;
        case IPC_CHANNELS.WORKSPACE_RESUME_STREAM:
          result = await this.ipcMain.handleResumeStream(...args as Parameters<typeof this.ipcMain.handleResumeStream>);
          break;
        case IPC_CHANNELS.WORKSPACE_INTERRUPT_STREAM:
          result = await this.ipcMain.handleInterruptStream(...args as [string]);
          break;
        case IPC_CHANNELS.WORKSPACE_GET_INFO:
          result = await this.ipcMain.handleGetWorkspaceInfo(...args as [string]);
          break;
        case IPC_CHANNELS.WORKSPACE_EXECUTE_BASH:
          result = await this.ipcMain.handleExecuteBash(...args as Parameters<typeof this.ipcMain.handleExecuteBash>);
          break;

        // Window operations are no-ops in web mode
        case IPC_CHANNELS.WINDOW_SET_TITLE:
          result = null;
          break;

        default:
          throw new Error(`Unknown channel: ${channel}`);
      }

      this.send(ws, {
        id,
        type: 'response',
        result,
      });
    } catch (error) {
      console.error(`Request handler error for channel ${channel}:`, error);
      this.sendError(ws, id, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async handleEvent(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
    const { channel, args = [] } = message;

    if (channel?.startsWith('workspace:chat:')) {
      if (channel === 'workspace:chat:subscribe') {
        const workspaceId = args[0] as string;
        const chatChannel = getChatChannel(workspaceId);
        ws.subscriptions.add(chatChannel);
        
        // Send historical messages
        // TODO: Implement history fetching
      } else if (channel === 'workspace:chat:unsubscribe') {
        const workspaceId = args[0] as string;
        const chatChannel = getChatChannel(workspaceId);
        ws.subscriptions.delete(chatChannel);
      }
    }
  }

  private handleClose(ws: AuthenticatedWebSocket) {
    if (ws.sessionId) {
      this.clients.delete(ws.sessionId);
      console.log(`Client disconnected: session=${ws.sessionId}`);
    }
  }

  private handleError(ws: AuthenticatedWebSocket, error: Error) {
    console.error(`WebSocket error for session ${ws.sessionId}:`, error);
  }

  private send(ws: WebSocket, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, id: string, error: string) {
    this.send(ws, {
      id,
      type: 'response',
      error,
    });
  }

  /**
   * Broadcast event to all subscribed clients
   */
  public broadcast(channel: string, data: unknown) {
    for (const [sessionId, ws] of this.clients) {
      if (ws.subscriptions.has(channel) && ws.readyState === WebSocket.OPEN) {
        this.send(ws, {
          id: `event-${Date.now()}`,
          type: 'event',
          channel,
          result: data,
        });
      }
    }
  }

  /**
   * Close all WebSocket connections
   */
  public closeAll() {
    for (const ws of this.clients.values()) {
      ws.close(1000, 'Server shutting down');
    }
    this.clients.clear();
  }
}

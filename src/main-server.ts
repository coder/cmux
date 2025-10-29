/**
 * HTTP/WebSocket Server for cmux
 * Allows accessing cmux backend from mobile devices
 */
import { Config } from "./config";
import { IPC_CHANNELS } from "@/constants/ipc-constants";
import { IpcMain } from "./services/ipcMain";
import cors from "cors";
import type { BrowserWindow, IpcMain as ElectronIpcMain } from "electron";
import express from "express";
import * as http from "http";
import * as path from "path";
import type { RawData } from "ws";
import { WebSocket, WebSocketServer } from "ws";
import { Command } from "commander";

// Parse command line arguments
const program = new Command();

program
  .name("cmux-server")
  .description("HTTP/WebSocket server for cmux - allows accessing cmux backend from mobile devices")
  .option("-h, --host <host>", "bind to specific host", "localhost")
  .option("-p, --port <port>", "bind to specific port", "3000")
  .parse(process.argv);

const options = program.opts();
const HOST = options.host as string;
const PORT = parseInt(options.port as string, 10);

// Mock Electron's ipcMain for HTTP
class HttpIpcMainAdapter {
  private handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  private listeners = new Map<string, Array<(event: unknown, ...args: unknown[]) => void>>();

  constructor(private readonly app: express.Application) {}

  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>): void {
    this.handlers.set(channel, handler);

    // Create HTTP endpoint for this handler
    this.app.post(`/ipc/${encodeURIComponent(channel)}`, async (req, res) => {
      try {
        const body = req.body as { args?: unknown[] };
        const args: unknown[] = body.args ?? [];
        const result = await handler(null, ...args);

        // If handler returns a failed Result type, pass through the error
        // This preserves structured error types like SendMessageError
        if (
          result &&
          typeof result === "object" &&
          "success" in result &&
          result.success === false
        ) {
          // Pass through failed Result to preserve error structure
          res.json(result);
          return;
        }

        // For all other return values (including successful Results), wrap in success response
        // The browser API will unwrap the data field
        res.json({ success: true, data: result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error in handler ${channel}:`, error);
        res.json({ success: false, error: message });
      }
    });
  }

  on(channel: string, handler: (event: unknown, ...args: unknown[]) => void): void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
    }
    this.listeners.get(channel)!.push(handler);
  }

  send(channel: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(channel);
    if (handlers) {
      handlers.forEach((handler) => handler(null, ...args));
    }
  }
}

type Clients = Map<WebSocket, { chatSubscriptions: Set<string>; metadataSubscription: boolean }>;

// Mock BrowserWindow for events
class MockBrowserWindow {
  constructor(private readonly clients: Clients) {}

  webContents = {
    send: (channel: string, ...args: unknown[]) => {
      // Broadcast to all WebSocket clients
      const message = JSON.stringify({ channel, args });
      this.clients.forEach((clientInfo, client) => {
        if (client.readyState !== WebSocket.OPEN) {
          return;
        }
        // Only send to clients subscribed to this channel
        if (channel === IPC_CHANNELS.WORKSPACE_METADATA && clientInfo.metadataSubscription) {
          client.send(message);
        } else if (channel.startsWith(IPC_CHANNELS.WORKSPACE_CHAT_PREFIX)) {
          // Extract workspace ID from channel
          const workspaceId = channel.replace(IPC_CHANNELS.WORKSPACE_CHAT_PREFIX, "");
          if (clientInfo.chatSubscriptions.has(workspaceId)) {
            client.send(message);
          }
        } else {
          // Send other channels to all clients
          client.send(message);
        }
      });
    },
  };
}

const app = express();

// Enable CORS for all routes
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Initialize config and IPC service
const config = new Config();
const ipcMainService = new IpcMain(config);

// Track WebSocket clients and their subscriptions
const clients: Clients = new Map();

const mockWindow = new MockBrowserWindow(clients);
const httpIpcMain = new HttpIpcMainAdapter(app);

// Register IPC handlers
ipcMainService.register(
  httpIpcMain as unknown as ElectronIpcMain,
  mockWindow as unknown as BrowserWindow
);

// Serve static files from dist directory (built renderer)
app.use(express.static(path.join(__dirname, ".")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Fallback to index.html for SPA routes (use middleware instead of deprecated wildcard)
app.use((req, res, next) => {
  if (!req.path.startsWith("/ipc") && !req.path.startsWith("/ws")) {
    res.sendFile(path.join(__dirname, "index.html"));
  } else {
    next();
  }
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("Client connected");

  // Initialize client tracking
  clients.set(ws, {
    chatSubscriptions: new Set(),
    metadataSubscription: false,
  });

  ws.on("message", (rawData: RawData) => {
    try {
      // WebSocket data can be Buffer, ArrayBuffer, or string - convert to string
      let dataStr: string;
      if (typeof rawData === "string") {
        dataStr = rawData;
      } else if (Buffer.isBuffer(rawData)) {
        dataStr = rawData.toString("utf-8");
      } else if (rawData instanceof ArrayBuffer) {
        dataStr = Buffer.from(rawData).toString("utf-8");
      } else {
        // Array of Buffers
        dataStr = Buffer.concat(rawData as Buffer[]).toString("utf-8");
      }
      const message = JSON.parse(dataStr) as {
        type: string;
        channel: string;
        workspaceId?: string;
      };
      const { type, channel, workspaceId } = message;

      const clientInfo = clients.get(ws);
      if (!clientInfo) return;

      if (type === "subscribe") {
        if (channel === "workspace:chat" && workspaceId) {
          console.log(`[WS] Client subscribed to workspace chat: ${workspaceId}`);
          clientInfo.chatSubscriptions.add(workspaceId);
          console.log(
            `[WS] Subscription added. Current subscriptions:`,
            Array.from(clientInfo.chatSubscriptions)
          );

          // Send subscription acknowledgment through IPC system
          console.log(`[WS] Triggering workspace:chat:subscribe handler for ${workspaceId}`);
          httpIpcMain.send("workspace:chat:subscribe", workspaceId);
        } else if (channel === "workspace:metadata") {
          console.log("[WS] Client subscribed to workspace metadata");
          clientInfo.metadataSubscription = true;

          // Send subscription acknowledgment
          httpIpcMain.send("workspace:metadata:subscribe");
        }
      } else if (type === "unsubscribe") {
        if (channel === "workspace:chat" && workspaceId) {
          console.log(`Client unsubscribed from workspace chat: ${workspaceId}`);
          clientInfo.chatSubscriptions.delete(workspaceId);

          // Send unsubscription acknowledgment
          httpIpcMain.send("workspace:chat:unsubscribe", workspaceId);
        } else if (channel === "workspace:metadata") {
          console.log("Client unsubscribed from workspace metadata");
          clientInfo.metadataSubscription = false;

          // Send unsubscription acknowledgment
          httpIpcMain.send("workspace:metadata:unsubscribe");
        }
      } else if (type === "invoke") {
        // Handle direct IPC invocations over WebSocket (for streaming responses)
        // This is not currently used but could be useful for future enhancements
        console.log(`WebSocket invoke: ${channel}`);
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    clients.delete(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
  });

server.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});

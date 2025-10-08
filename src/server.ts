/**
 * HTTP/WebSocket Server for cmux
 * Allows accessing cmux backend from mobile devices
 */
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import * as http from "http";
import * as path from "path";
import { Config } from "./config";
import { IpcMain } from "./services/ipcMain";
import { IPC_CHANNELS, getChatChannel } from "./constants/ipc-constants";
import type { IpcMain as ElectronIpcMain } from "electron";
import type { BrowserWindow } from "electron";

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";

// Enable CORS for all routes
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Initialize config and IPC service
const config = new Config();
const ipcMainService = new IpcMain(config);

// Track WebSocket clients and their subscriptions
const clients = new Map<
  WebSocket,
  {
    chatSubscriptions: Set<string>;
    metadataSubscription: boolean;
  }
>();

// Mock Electron's ipcMain for HTTP
class HttpIpcMainAdapter {
  private handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  private listeners = new Map<string, Array<(event: unknown, ...args: unknown[]) => void>>();

  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>): void {
    this.handlers.set(channel, handler);

    // Create HTTP endpoint for this handler
    app.post(`/ipc/${encodeURIComponent(channel)}`, async (req, res) => {
      try {
        const args = req.body.args || [];
        const result = await handler(null, ...args);

        // If handler returns an error result object, unwrap it and send as error response
        // This ensures webApi.ts will throw with the proper error message
        if (
          result &&
          typeof result === "object" &&
          "success" in result &&
          result.success === false
        ) {
          const errorMessage =
            "error" in result && typeof result.error === "string" ? result.error : "Unknown error";
          // Return 200 with error structure so webApi can throw with the detailed message
          res.json({ success: false, error: errorMessage });
          return;
        }

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

// Mock BrowserWindow for events
class MockBrowserWindow {
  webContents = {
    send: (channel: string, ...args: unknown[]) => {
      // Broadcast to all WebSocket clients
      const message = JSON.stringify({ channel, args });
      clients.forEach((clientInfo, client) => {
        if (client.readyState === WebSocket.OPEN) {
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
        }
      });
    },
  };
}

const mockWindow = new MockBrowserWindow();
const httpIpcMain = new HttpIpcMainAdapter();

// Register IPC handlers
ipcMainService.register(
  httpIpcMain as unknown as ElectronIpcMain,
  mockWindow as unknown as BrowserWindow
);

console.log("IPC handlers registered");

// Serve static files from dist directory (built renderer)
app.use(express.static(path.join(__dirname, ".")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Fallback to index.html for SPA routes
app.get("*", (req, res) => {
  if (!req.path.startsWith("/ipc") && !req.path.startsWith("/ws")) {
    res.sendFile(path.join(__dirname, "index.html"));
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

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      const { type, channel, workspaceId, args } = message;

      const clientInfo = clients.get(ws);
      if (!clientInfo) return;

      if (type === "subscribe") {
        if (channel === "workspace:chat") {
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
        if (channel === "workspace:chat") {
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

server.listen(Number(port), host as string, () => {
  console.log(`\n🚀 cmux server running at http://${host}:${port}`);
  console.log(`\n📱 Access from your iPhone:`);
  console.log(`   1. Make sure your iPhone and computer are on the same WiFi network`);
  console.log(`   2. Find your computer's local IP address (run 'ifconfig' or 'ipconfig')`);
  console.log(`   3. Open Safari on your iPhone and navigate to: http://YOUR_COMPUTER_IP:${port}`);
  console.log(`\n🔌 WebSocket endpoint: ws://${host}:${port}/ws`);
  console.log(`\n💡 Available IPC endpoints:`);
  console.log(`   POST /ipc/<channel-name>`);
  console.log(`   Body: { "args": [...] }`);
  console.log(`\n`);
});

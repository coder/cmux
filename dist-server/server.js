"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * HTTP/WebSocket Server for cmux
 * Allows accessing cmux backend from mobile devices
 */
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const http = __importStar(require("http"));
const path = __importStar(require("path"));
const config_1 = require("./config");
const ipcMain_1 = require("./services/ipcMain");
const ipc_constants_1 = require("./constants/ipc-constants");
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";
// Enable CORS for all routes
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "50mb" }));
// Initialize config and IPC service
const config = new config_1.Config();
const ipcMainService = new ipcMain_1.IpcMain(config);
// Track WebSocket clients and their subscriptions
const clients = new Map();
// Mock Electron's ipcMain for HTTP
class HttpIpcMainAdapter {
    handlers = new Map();
    listeners = new Map();
    handle(channel, handler) {
        this.handlers.set(channel, handler);
        // Create HTTP endpoint for this handler
        app.post(`/ipc/${channel}`, async (req, res) => {
            try {
                const args = req.body.args || [];
                const result = await handler(null, ...args);
                res.json({ success: true, data: result });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`Error in handler ${channel}:`, error);
                res.status(500).json({ success: false, error: message });
            }
        });
    }
    on(channel, handler) {
        if (!this.listeners.has(channel)) {
            this.listeners.set(channel, []);
        }
        this.listeners.get(channel).push(handler);
    }
    send(channel, ...args) {
        const handlers = this.listeners.get(channel);
        if (handlers) {
            handlers.forEach((handler) => handler(null, ...args));
        }
    }
}
// Mock BrowserWindow for events
class MockBrowserWindow {
    webContents = {
        send: (channel, ...args) => {
            // Broadcast to all WebSocket clients
            const message = JSON.stringify({ channel, args });
            clients.forEach((clientInfo, client) => {
                if (client.readyState === ws_1.WebSocket.OPEN) {
                    // Only send to clients subscribed to this channel
                    if (channel === ipc_constants_1.IPC_CHANNELS.WORKSPACE_METADATA && clientInfo.metadataSubscription) {
                        client.send(message);
                    }
                    else if (channel.startsWith(ipc_constants_1.IPC_CHANNELS.WORKSPACE_CHAT_PREFIX)) {
                        // Extract workspace ID from channel
                        const workspaceId = channel.replace(ipc_constants_1.IPC_CHANNELS.WORKSPACE_CHAT_PREFIX, "");
                        if (clientInfo.chatSubscriptions.has(workspaceId)) {
                            client.send(message);
                        }
                    }
                    else {
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
ipcMainService.register(httpIpcMain, mockWindow);
console.log("IPC handlers registered");
// Serve static files from dist directory (built renderer)
app.use(express_1.default.static(path.join(__dirname, "../dist")));
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});
// Fallback to index.html for SPA routes
app.get("*", (req, res) => {
    if (!req.path.startsWith("/ipc") && !req.path.startsWith("/ws")) {
        res.sendFile(path.join(__dirname, "../dist/index.html"));
    }
});
// Create HTTP server
const server = http.createServer(app);
// Create WebSocket server
const wss = new ws_1.WebSocketServer({ server, path: "/ws" });
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
            if (!clientInfo)
                return;
            if (type === "subscribe") {
                if (channel === "workspace:chat") {
                    console.log(`Client subscribed to workspace chat: ${workspaceId}`);
                    clientInfo.chatSubscriptions.add(workspaceId);
                    // Send subscription acknowledgment through IPC system
                    httpIpcMain.send("workspace:chat:subscribe", workspaceId);
                }
                else if (channel === "workspace:metadata") {
                    console.log("Client subscribed to workspace metadata");
                    clientInfo.metadataSubscription = true;
                    // Send subscription acknowledgment
                    httpIpcMain.send("workspace:metadata:subscribe");
                }
            }
            else if (type === "unsubscribe") {
                if (channel === "workspace:chat") {
                    console.log(`Client unsubscribed from workspace chat: ${workspaceId}`);
                    clientInfo.chatSubscriptions.delete(workspaceId);
                    // Send unsubscription acknowledgment
                    httpIpcMain.send("workspace:chat:unsubscribe", workspaceId);
                }
                else if (channel === "workspace:metadata") {
                    console.log("Client unsubscribed from workspace metadata");
                    clientInfo.metadataSubscription = false;
                    // Send unsubscription acknowledgment
                    httpIpcMain.send("workspace:metadata:unsubscribe");
                }
            }
            else if (type === "invoke") {
                // Handle direct IPC invocations over WebSocket (for streaming responses)
                // This is not currently used but could be useful for future enhancements
                console.log(`WebSocket invoke: ${channel}`);
            }
        }
        catch (error) {
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
server.listen(Number(port), host, () => {
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
//# sourceMappingURL=server.js.map
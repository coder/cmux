import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "http";
import { createServer } from "http";
import { log } from "@/services/log";
import type { PTYService } from "@/services/ptyService";
import type { TerminalMessage, TerminalServerMessage } from "@/types/terminal";

/**
 * TerminalServer - WebSocket server for terminal I/O
 *
 * Handles bidirectional communication between frontend terminals and backend PTY sessions.
 * Runs on a random localhost port for security.
 */
export class TerminalServer {
  private server: Server | undefined = undefined;
  private wss: WebSocketServer | null = null;
  private port: number = 0;
  private readonly ptyService: PTYService;
  private readonly connections = new Map<string, WebSocket>(); // sessionId -> WebSocket

  constructor(ptyService: PTYService) {
    this.ptyService = ptyService;
  }

  /**
   * Start the WebSocket server on a random port
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      // Create HTTP server on random port
      this.server = createServer();

      this.server.on("error", (err) => {
        log.error("Terminal server error:", err);
        reject(err);
      });

      // Listen on random port (0 = OS assigns)
      this.server.listen(0, "127.0.0.1", () => {
        const address = this.server!.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to get server address"));
          return;
        }

        this.port = address.port;
        log.info(`Terminal WebSocket server listening on port ${this.port}`);

        // Create WebSocket server
        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on("connection", (ws: WebSocket) => {
          this.handleConnection(ws);
        });

        resolve(this.port);
      });
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          log.info("Terminal WebSocket server stopped");
          resolve();
        });
        this.server = undefined;
      });
    }
  }

  /**
   * Get the server port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket): void {
    log.debug("New terminal WebSocket connection");

    ws.on("message", (data: Buffer) => {
      try {
        const message: TerminalMessage = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (err) {
        log.error("Error parsing terminal message:", err);
        ws.close(1003, "Invalid message format");
      }
    });

    ws.on("close", () => {
      // Remove from connections map
      for (const [sessionId, socket] of this.connections.entries()) {
        if (socket === ws) {
          this.connections.delete(sessionId);
          log.debug(`WebSocket closed for session ${sessionId}`);
          break;
        }
      }
    });

    ws.on("error", (err) => {
      log.error("WebSocket error:", err);
    });
  }

  /**
   * Handle incoming terminal message
   */
  private handleMessage(ws: WebSocket, message: TerminalMessage): void {
    if (message.type === "input") {
      // Forward input to PTY
      this.ptyService
        .sendInput(message.sessionId, message.data)
        .catch((err) => {
          log.error(`Error sending input to session ${message.sessionId}:`, err);
          this.sendMessage(ws, {
            type: "exit",
            sessionId: message.sessionId,
            exitCode: 1,
          });
        });

      // Register this connection for the session
      if (!this.connections.has(message.sessionId)) {
        this.connections.set(message.sessionId, ws);
      }
    } else if (message.type === "resize") {
      // Forward resize to PTY
      this.ptyService
        .resize({
          sessionId: message.sessionId,
          cols: message.cols,
          rows: message.rows,
        })
        .catch((err) => {
          log.error(`Error resizing session ${message.sessionId}:`, err);
        });
    }
  }

  /**
   * Send message to WebSocket client
   */
  private sendMessage(ws: WebSocket, message: TerminalServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send output to a specific session's WebSocket
   */
  sendOutput(sessionId: string, data: string): void {
    const ws = this.connections.get(sessionId);
    if (ws) {
      this.sendMessage(ws, {
        type: "output",
        sessionId,
        data,
      });
    }
  }

  /**
   * Send exit notification to a specific session's WebSocket
   */
  sendExit(sessionId: string, exitCode: number): void {
    const ws = this.connections.get(sessionId);
    if (ws) {
      this.sendMessage(ws, {
        type: "exit",
        sessionId,
        exitCode,
      });
      this.connections.delete(sessionId);
    }
  }
}

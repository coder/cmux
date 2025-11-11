import { log } from "@/services/log";
import type { Runtime } from "@/runtime/Runtime";
import type { ExecStream } from "@/runtime/Runtime";
import type {
  TerminalSession,
  TerminalCreateParams,
  TerminalResizeParams,
} from "@/types/terminal";
import { SSHRuntime } from "@/runtime/SSHRuntime";
import { LocalRuntime } from "@/runtime/LocalRuntime";

interface SessionData {
  pty?: any; // For local sessions (IPty type)
  stream?: ExecStream; // For SSH sessions
  workspaceId: string;
  workspacePath: string;
  runtime: Runtime;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
}

/**
 * PTYService - Manages terminal PTY sessions for workspaces
 *
 * Handles both local (using node-pty) and remote (using SSH) terminal sessions.
 * Each workspace can have one or more terminal sessions.
 */
export class PTYService {
  private sessions = new Map<string, SessionData>();
  private terminalServer?: any; // TerminalServer reference (circular dependency handled loosely)

  setTerminalServer(server: any): void {
    this.terminalServer = server;
  }

  /**
   * Create a new terminal session for a workspace
   */
  async createSession(
    params: TerminalCreateParams,
    runtime: Runtime,
    workspacePath: string
  ): Promise<TerminalSession> {
    const sessionId = `${params.workspaceId}-${Date.now()}`;

    log.info(
      `Creating terminal session ${sessionId} for workspace ${params.workspaceId} (${runtime instanceof SSHRuntime ? "SSH" : "local"})`
    );

    if (runtime instanceof LocalRuntime) {
      // Local: Use node-pty (dynamically import to avoid crash if not available)
      let pty: typeof import("node-pty");
      try {
        pty = require("node-pty");
      } catch (err) {
        log.error("node-pty not available - local terminals will not work:", err);
        throw new Error(
          "Local terminals are not available. node-pty failed to load (likely due to Electron ABI version mismatch). Use SSH workspaces for terminal access."
        );
      }

      const shell = process.env.SHELL || "/bin/bash";

      const ptyProcess = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols: params.cols,
        rows: params.rows,
        cwd: workspacePath,
        env: process.env as Record<string, string>,
      });

      // Forward PTY data to terminal server
      ptyProcess.onData((data) => {
        this.terminalServer?.sendOutput(sessionId, data);
      });

      // Handle exit
      ptyProcess.onExit(({ exitCode }) => {
        log.info(`Terminal session ${sessionId} exited with code ${exitCode}`);
        this.sessions.delete(sessionId);
        this.terminalServer?.sendExit(sessionId, exitCode);
      });

      this.sessions.set(sessionId, {
        pty: ptyProcess,
        workspaceId: params.workspaceId,
        workspacePath,
        runtime,
        onData: (data) => this.terminalServer?.sendOutput(sessionId, data),
        onExit: (exitCode) => this.terminalServer?.sendExit(sessionId, exitCode),
      });
    } else if (runtime instanceof SSHRuntime) {
      // SSH: Use runtime.exec with PTY allocation
      const shell = "$SHELL"; // Use remote user's shell
      const command = `exec ${shell}`;

      log.info(`[PTY] SSH command for ${sessionId}: ${command}`);
      log.info(`[PTY] SSH working directory: ${workspacePath}`);

      let stream;
      try {
        log.info(`[PTY] Calling runtime.exec for ${sessionId}...`);
        // Execute shell with PTY allocation
        // Use a very long timeout (24 hours) instead of Infinity
        stream = await (runtime as any).exec(command, {
        cwd: workspacePath,
        timeout: 86400, // 24 hours in seconds
        env: {
          TERM: "xterm-256color",
        },
        forcePTY: true,
      });
        log.info(`[PTY] runtime.exec returned successfully for ${sessionId}`);
      } catch (err) {
        log.error(`[PTY] Failed to create SSH stream for ${sessionId}:`, err);
        throw err;
      }

      log.info(`[PTY] SSH stream created for ${sessionId}, stdin writable: ${stream.stdin.locked === false}`);

      this.sessions.set(sessionId, {
        stream,
        workspaceId: params.workspaceId,
        workspacePath,
        runtime,
        onData: (data) => this.terminalServer?.sendOutput(sessionId, data),
        onExit: (exitCode) => this.terminalServer?.sendExit(sessionId, exitCode),
      });

      // Pipe stdout to terminal server
      const reader = stream.stdout.getReader();
      const decoder = new TextDecoder();

      (async () => {
        try {
          let bytesRead = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              log.info(`[PTY] SSH stdout closed for ${sessionId} after ${bytesRead} bytes`);
              break;
            }
            bytesRead += value.length;
            const text = decoder.decode(value, { stream: true });
            this.terminalServer?.sendOutput(sessionId, text);
          }
        } catch (err) {
          log.error(`[PTY] Error reading from SSH terminal ${sessionId}:`, err);
        }
      })();

      // Handle exit
      stream.exitCode
        .then((exitCode: number) => {
          log.info(`[PTY] SSH terminal session ${sessionId} exited with code ${exitCode}`);
          this.sessions.delete(sessionId);
          this.terminalServer?.sendExit(sessionId, exitCode);
        })
        .catch((err: unknown) => {
          log.error(`[PTY] SSH terminal session ${sessionId} error:`, err);
          this.sessions.delete(sessionId);
          this.terminalServer?.sendExit(sessionId, 1);
        });
    } else {
      throw new Error(`Unsupported runtime type: ${runtime.constructor.name}`);
    }

    return {
      sessionId,
      workspaceId: params.workspaceId,
      cols: params.cols,
      rows: params.rows,
    };
  }

  /**
   * Send input to a terminal session
   */
  async sendInput(sessionId: string, data: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session ${sessionId} not found`);
    }

    if (session.pty) {
      // Local: Write to PTY
      session.pty.write(data);
    } else if (session.stream) {
      // SSH: Write to stdin
      const writer = session.stream.stdin.getWriter();
      try {
        await writer.write(new TextEncoder().encode(data));
      } finally {
        writer.releaseLock();
      }
    }
  }

  /**
   * Resize a terminal session
   */
  async resize(params: TerminalResizeParams): Promise<void> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      log.info(`Cannot resize terminal session ${params.sessionId}: not found`);
      return;
    }

    if (session.pty) {
      // Local: Resize PTY
      session.pty.resize(params.cols, params.rows);
      log.debug(
        `Resized local terminal ${params.sessionId} to ${params.cols}x${params.rows}`
      );
    } else {
      // SSH: Cannot resize remote PTY through exec stream
      // This would require SIGWINCH support which exec() doesn't provide
      log.info(
        `Cannot resize SSH terminal ${params.sessionId}: resize not supported for SSH sessions`
      );
    }
  }

  /**
   * Close a terminal session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.info(`Cannot close terminal session ${sessionId}: not found`);
      return;
    }

    log.info(`Closing terminal session ${sessionId}`);

    if (session.pty) {
      // Local: Kill PTY process
      session.pty.kill();
    } else if (session.stream) {
      // SSH: Close stdin to signal EOF
      const writer = session.stream.stdin.getWriter();
      try {
        await writer.close();
      } catch (err) {
        log.error(`Error closing SSH terminal ${sessionId}:`, err);
      }
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Close all terminal sessions for a workspace
   */
  async closeWorkspaceSessions(workspaceId: string): Promise<void> {
    const sessionIds = Array.from(this.sessions.entries())
      .filter(([, session]) => session.workspaceId === workspaceId)
      .map(([id]) => id);

    log.info(
      `Closing ${sessionIds.length} terminal session(s) for workspace ${workspaceId}`
    );

    await Promise.all(sessionIds.map((id) => this.closeSession(id)));
  }

  /**
   * Get all sessions for debugging
   */
  getSessions(): Map<string, SessionData> {
    return this.sessions;
  }
}

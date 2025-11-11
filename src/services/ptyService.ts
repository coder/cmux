import * as pty from "node-pty";
import type { IPty } from "node-pty";
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
  pty?: IPty; // For local sessions
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
      // Local: Use node-pty
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

      // Execute shell with PTY allocation
      // Note: We need to add forcePTY option to SSHRuntime.exec()
      const stream = await (runtime as any).exec(`exec ${shell}`, {
        cwd: workspacePath,
        timeout: Infinity, // Terminal sessions don't timeout
        env: {
          TERM: "xterm-256color",
        },
        forcePTY: true, // Will be added to SSHRuntime
      });

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
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            this.terminalServer?.sendOutput(sessionId, text);
          }
        } catch (err) {
          log.error(`Error reading from SSH terminal ${sessionId}:`, err);
        }
      })();

      // Handle exit
      stream.exitCode
        .then((exitCode: number) => {
          log.info(`SSH terminal session ${sessionId} exited with code ${exitCode}`);
          this.sessions.delete(sessionId);
          this.terminalServer?.sendExit(sessionId, exitCode);
        })
        .catch((err: unknown) => {
          log.error(`SSH terminal session ${sessionId} error:`, err);
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

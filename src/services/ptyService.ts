/**
 * PTY Service - Manages terminal PTY sessions
 *
 * Handles both local (using node-pty) and remote (using SSH) terminal sessions.
 * Uses callbacks for output/exit events to avoid circular dependencies.
 */

/* eslint-disable local/no-sync-fs-methods */

import { log } from "@/services/log";
import type { Runtime, ExecStream } from "@/runtime/Runtime";
import type { TerminalSession, TerminalCreateParams, TerminalResizeParams } from "@/types/terminal";
import type { IPty } from "node-pty";
import { SSHRuntime } from "@/runtime/SSHRuntime";
import { LocalRuntime } from "@/runtime/LocalRuntime";
import * as fs from "fs";

interface SessionData {
  pty?: IPty; // For local sessions
  stream?: ExecStream; // For SSH sessions
  stdinWriter?: WritableStreamDefaultWriter<Uint8Array>; // Persistent writer for SSH stdin
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

  /**
   * Create a new terminal session for a workspace
   */
  async createSession(
    params: TerminalCreateParams,
    runtime: Runtime,
    workspacePath: string,
    onData: (data: string) => void,
    onExit: (exitCode: number) => void
  ): Promise<TerminalSession> {
    const sessionId = `${params.workspaceId}-${Date.now()}`;

    log.info(
      `Creating terminal session ${sessionId} for workspace ${params.workspaceId} (${runtime instanceof SSHRuntime ? "SSH" : "local"})`
    );

    if (runtime instanceof LocalRuntime) {
      // Local: Use node-pty (dynamically import to avoid crash if not available)
      // eslint-disable-next-line @typescript-eslint/consistent-type-imports
      let pty: typeof import("node-pty");
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
        pty = require("node-pty");
      } catch (err) {
        log.error("node-pty not available - local terminals will not work:", err);
        throw new Error(
          "Local terminals are not available. node-pty failed to load (likely due to Electron ABI version mismatch). Use SSH workspaces for terminal access."
        );
      }

      // Validate workspace path exists
      if (!fs.existsSync(workspacePath)) {
        throw new Error(`Workspace path does not exist: ${workspacePath}`);
      }

      const shell = process.env.SHELL ?? "/bin/bash";

      log.info(
        `Spawning PTY with shell: ${shell}, cwd: ${workspacePath}, size: ${params.cols}x${params.rows}`
      );
      log.debug(`PATH env: ${process.env.PATH ?? "undefined"}`);

      let ptyProcess;
      try {
        ptyProcess = pty.spawn(shell, [], {
          name: "xterm-256color",
          cols: params.cols,
          rows: params.rows,
          cwd: workspacePath,
          env: {
            ...process.env,
            TERM: "xterm-256color",
            // Ensure PATH is set properly for shell to find commands
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
          },
        });
      } catch (err) {
        log.error(`Failed to spawn PTY: ${String(err)}`);
        log.error(`Shell: ${shell}, CWD: ${workspacePath}`);
        log.error(`process.env.SHELL: ${process.env.SHELL ?? "undefined"}`);
        log.error(`process.env.PATH: ${process.env.PATH ?? "undefined"}`);
        throw new Error(
          `Failed to spawn shell "${shell}": ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // Forward PTY data via callback
      // Buffer to handle escape sequences split across chunks
      let buffer = "";

      ptyProcess.onData((data) => {
        // Append new data to buffer
        buffer += data;

        // Check if buffer ends with an incomplete escape sequence
        // Look for ESC at the end without its complete sequence
        let sendUpTo = buffer.length;

        // If buffer ends with ESC or ESC[, hold it back for next chunk
        if (buffer.endsWith("\x1b")) {
          sendUpTo = buffer.length - 1;
        } else if (buffer.endsWith("\x1b[")) {
          sendUpTo = buffer.length - 2;
        } else {
          // Check if it ends with ESC[ followed by incomplete CSI sequence
          // eslint-disable-next-line no-control-regex, @typescript-eslint/prefer-regexp-exec
          const match = buffer.match(/\x1b\[[0-9;]*$/);
          if (match) {
            sendUpTo = buffer.length - match[0].length;
          }
        }

        // Send complete data
        if (sendUpTo > 0) {
          const toSend = buffer.substring(0, sendUpTo);
          onData(toSend);
          buffer = buffer.substring(sendUpTo);
        }
      });

      // Handle exit
      ptyProcess.onExit(({ exitCode }) => {
        log.info(`Terminal session ${sessionId} exited with code ${exitCode}`);
        this.sessions.delete(sessionId);
        onExit(exitCode);
      });

      this.sessions.set(sessionId, {
        pty: ptyProcess,
        workspaceId: params.workspaceId,
        workspacePath,
        runtime,
        onData,
        onExit,
      });
    } else if (runtime instanceof SSHRuntime) {
      // SSH: Use runtime.exec with PTY allocation
      // Use 'script' to force a proper PTY session with the shell
      // Set LINES and COLUMNS before starting script so the shell knows the terminal size
      // -q = quiet (no start/done messages)
      // -c = command to run
      // /dev/null = don't save output to a file
      const command = `export LINES=${params.rows} COLUMNS=${params.cols}; script -qfc "$SHELL -i" /dev/null`;

      log.info(`[PTY] SSH command for ${sessionId}: ${command}`);
      log.info(`[PTY] SSH terminal size: ${params.cols}x${params.rows}`);
      log.info(`[PTY] SSH working directory: ${workspacePath}`);

      let stream: ExecStream;
      try {
        log.info(`[PTY] Calling runtime.exec for ${sessionId}...`);
        // Execute shell with PTY allocation
        // Use a very long timeout (24 hours) instead of Infinity
        stream = await runtime.exec(command, {
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

      log.info(
        `[PTY] SSH stream created for ${sessionId}, stdin writable: ${stream.stdin.locked === false}`
      );

      // Get a persistent writer for stdin to avoid locking issues
      const stdinWriter = stream.stdin.getWriter();

      this.sessions.set(sessionId, {
        stream,
        stdinWriter,
        workspaceId: params.workspaceId,
        workspacePath,
        runtime,
        onData,
        onExit,
      });

      // Pipe stdout via callback
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
            onData(text);
          }
        } catch (err) {
          log.error(`[PTY] Error reading from SSH terminal ${sessionId}:`, err);
        }
      })();

      // Pipe stderr to terminal AND logs (zsh sends prompt to stderr)
      const stderrReader = stream.stderr.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            // Send stderr to terminal (shells often write prompts to stderr)
            onData(text);
          }
        } catch (err) {
          log.error(`[PTY] Error reading stderr for ${sessionId}:`, err);
        }
      })();

      // Handle exit
      stream.exitCode
        .then((exitCode: number) => {
          log.info(`[PTY] SSH terminal session ${sessionId} exited with code ${exitCode}`);
          log.info(
            `[PTY] Session was alive for ${((Date.now() - parseInt(sessionId.split("-")[1])) / 1000).toFixed(1)}s`
          );
          this.sessions.delete(sessionId);
          onExit(exitCode);
        })
        .catch((err: unknown) => {
          log.error(`[PTY] SSH terminal session ${sessionId} error:`, err);
          this.sessions.delete(sessionId);
          onExit(1);
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
    } else if (session.stdinWriter) {
      // SSH: Write to stdin using persistent writer
      try {
        await session.stdinWriter.write(new TextEncoder().encode(data));
      } catch (err) {
        log.error(`[PTY] Error writing to ${sessionId}:`, err);
        throw err;
      }
    }
  }

  /**
   * Resize a terminal session
   */
  resize(params: TerminalResizeParams): void {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      log.info(`Cannot resize terminal session ${params.sessionId}: not found`);
      return;
    }

    if (session.pty) {
      // Local: Resize PTY
      session.pty.resize(params.cols, params.rows);
      log.debug(`Resized local terminal ${params.sessionId} to ${params.cols}x${params.rows}`);
    } else {
      // SSH: Dynamic resize not supported for SSH sessions
      // The terminal size is set at session creation time via LINES/COLUMNS env vars
      log.debug(
        `SSH terminal ${params.sessionId} resize requested to ${params.cols}x${params.rows} (not supported)`
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
    } else if (session.stdinWriter) {
      // SSH: Close stdin writer to signal EOF
      try {
        await session.stdinWriter.close();
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

    log.info(`Closing ${sessionIds.length} terminal session(s) for workspace ${workspaceId}`);

    await Promise.all(sessionIds.map((id) => this.closeSession(id)));
  }

  /**
   * Get all sessions for debugging
   */
  getSessions(): Map<string, SessionData> {
    return this.sessions;
  }
}

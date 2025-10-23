import { spawn } from "child_process";
import type { Runtime, ExecOptions, ExecResult, FileStat } from "./Runtime";
import { RuntimeError as RuntimeErrorClass } from "./Runtime";
import { createInterface } from "readline";

/**
 * SSH Runtime Configuration
 */
export interface SSHRuntimeConfig {
  /** SSH host (can be hostname, user@host, or SSH config alias) */
  host: string;
  /** Working directory on remote host */
  workdir: string;
}

/**
 * SSH runtime implementation that executes commands and file operations
 * over SSH using the ssh command-line tool.
 *
 * Features:
 * - Uses system ssh command (respects ~/.ssh/config)
 * - Supports SSH config aliases, ProxyJump, ControlMaster, etc.
 * - No password prompts (assumes key-based auth or ssh-agent)
 * - Atomic file writes via temp + rename
 */
export class SSHRuntime implements Runtime {
  private readonly config: SSHRuntimeConfig;

  constructor(config: SSHRuntimeConfig) {
    this.config = config;
  }

  /**
   * Execute command over SSH
   */
  async exec(command: string, options: ExecOptions): Promise<ExecResult> {
    const startTime = performance.now();

    // Build environment string
    let envPrefix = "";
    if (options.env) {
      const envPairs = Object.entries(options.env)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" ");
      envPrefix = `export ${envPairs}; `;
    }

    // Build full command with cwd and env
    const remoteCommand = `cd ${JSON.stringify(options.cwd)} && ${envPrefix}${command}`;

    return new Promise<ExecResult>((resolve, reject) => {
      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];
      let resolved = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      const resolveOnce = (result: ExecResult) => {
        if (!resolved) {
          resolved = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (options.abortSignal && abortListener) {
            options.abortSignal.removeEventListener("abort", abortListener);
          }
          resolve(result);
        }
      };

      const rejectOnce = (error: RuntimeErrorClass) => {
        if (!resolved) {
          resolved = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (options.abortSignal && abortListener) {
            options.abortSignal.removeEventListener("abort", abortListener);
          }
          reject(error);
        }
      };

      // Spawn ssh command
      const sshProcess = spawn("ssh", ["-T", this.config.host, remoteCommand], {
        stdio: [options.stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
      });

      // Write stdin if provided
      if (options.stdin !== undefined && sshProcess.stdin) {
        sshProcess.stdin.write(options.stdin);
        sshProcess.stdin.end();
      }

      // Set up abort signal listener
      let abortListener: (() => void) | null = null;
      if (options.abortSignal) {
        abortListener = () => {
          if (!resolved) {
            sshProcess.kill();
          }
        };
        options.abortSignal.addEventListener("abort", abortListener);
      }

      // Set up timeout
      const timeout = options.timeout ?? 3;
      timeoutHandle = setTimeout(() => {
        if (!resolved) {
          sshProcess.kill();
        }
      }, timeout * 1000);

      // Read stdout and stderr line by line
      const stdoutReader = createInterface({ input: sshProcess.stdout! });
      const stderrReader = createInterface({ input: sshProcess.stderr! });

      stdoutReader.on("line", (line) => {
        if (!resolved) {
          stdoutLines.push(line);
        }
      });

      stderrReader.on("line", (line) => {
        if (!resolved) {
          stderrLines.push(line);
        }
      });

      // Handle process completion
      sshProcess.on("close", (code, signal) => {
        if (resolved) return;

        const duration = performance.now() - startTime;
        const exitCode = code ?? (signal ? -1 : 0);

        // Check if aborted
        if (options.abortSignal?.aborted) {
          rejectOnce(new RuntimeErrorClass("Command execution was aborted", "exec"));
          return;
        }

        // Check if timed out
        if (signal === "SIGTERM" && options.timeout !== undefined) {
          rejectOnce(
            new RuntimeErrorClass(`Command exceeded timeout of ${options.timeout} seconds`, "exec")
          );
          return;
        }

        resolveOnce({
          stdout: stdoutLines.join("\n"),
          stderr: stderrLines.join("\n"),
          exitCode,
          duration,
        });
      });

      sshProcess.on("error", (err) => {
        if (!resolved) {
          rejectOnce(
            new RuntimeErrorClass(`Failed to execute SSH command: ${err.message}`, "exec", err)
          );
        }
      });
    });
  }

  /**
   * Read file contents over SSH
   */
  async readFile(path: string): Promise<string> {
    const result = await this.exec(`cat ${JSON.stringify(path)}`, {
      cwd: this.config.workdir,
    });

    if (result.exitCode !== 0) {
      throw new RuntimeErrorClass(`Failed to read file ${path}: ${result.stderr}`, "file_io");
    }

    return result.stdout;
  }

  /**
   * Write file contents over SSH atomically
   */
  async writeFile(path: string, content: string): Promise<void> {
    const tempPath = `${path}.tmp.${Date.now()}`;

    // Write to temp file, then atomically rename
    const writeCommand = `cat > ${JSON.stringify(tempPath)} && chmod 600 ${JSON.stringify(tempPath)} && mv ${JSON.stringify(tempPath)} ${JSON.stringify(path)}`;

    const result = await this.exec(writeCommand, {
      cwd: this.config.workdir,
      stdin: content,
    });

    if (result.exitCode !== 0) {
      throw new RuntimeErrorClass(`Failed to write file ${path}: ${result.stderr}`, "file_io");
    }
  }

  /**
   * Get file statistics over SSH
   */
  async stat(path: string): Promise<FileStat> {
    // Use stat with format string to get: size, mtime, type
    // %s = size, %Y = mtime (seconds since epoch), %F = file type
    const result = await this.exec(`stat -c '%s %Y %F' ${JSON.stringify(path)}`, {
      cwd: this.config.workdir,
    });

    if (result.exitCode !== 0) {
      throw new RuntimeErrorClass(`Failed to stat ${path}: ${result.stderr}`, "file_io");
    }

    const parts = result.stdout.trim().split(" ");
    if (parts.length < 3) {
      throw new RuntimeErrorClass(
        `Failed to parse stat output for ${path}: ${result.stdout}`,
        "file_io"
      );
    }

    const size = parseInt(parts[0], 10);
    const mtime = parseInt(parts[1], 10);
    const fileType = parts.slice(2).join(" ");

    return {
      size,
      modifiedTime: new Date(mtime * 1000),
      isFile: fileType === "regular file" || fileType === "regular empty file",
      isDirectory: fileType === "directory",
    };
  }
}

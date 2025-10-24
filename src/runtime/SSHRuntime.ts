import { spawn } from "child_process";
import { Readable, Writable } from "stream";
import type {
  Runtime,
  ExecOptions,
  ExecStream,
  FileStat,
  WorkspaceCreationParams,
  WorkspaceCreationResult,
  InitLogger,
} from "./Runtime";
import { RuntimeError as RuntimeErrorClass } from "./Runtime";
import { log } from "../services/log";
import { checkInitHookExists, createLineBufferedLoggers } from "./initHook";

/**
 * SSH Runtime Configuration
 */
export interface SSHRuntimeConfig {
  /** SSH host (can be hostname, user@host, or SSH config alias) */
  host: string;
  /** Working directory on remote host */
  workdir: string;
  /** Optional: Path to SSH private key (if not using ~/.ssh/config or ssh-agent) */
  identityFile?: string;
  /** Optional: SSH port (default: 22) */
  port?: number;
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
   * Execute command over SSH with streaming I/O
   */
  exec(command: string, options: ExecOptions): ExecStream {
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

    // Build SSH args
    const sshArgs: string[] = ["-T"];

    // Add port if specified
    if (this.config.port) {
      sshArgs.push("-p", this.config.port.toString());
    }

    // Add identity file if specified
    if (this.config.identityFile) {
      sshArgs.push("-i", this.config.identityFile);
      // Disable strict host key checking for test environments
      sshArgs.push("-o", "StrictHostKeyChecking=no");
      sshArgs.push("-o", "UserKnownHostsFile=/dev/null");
      sshArgs.push("-o", "LogLevel=ERROR"); // Suppress SSH warnings
    }

    sshArgs.push(this.config.host, remoteCommand);

    // Spawn ssh command
    const sshProcess = spawn("ssh", sshArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Convert Node.js streams to Web Streams
    const stdout = Readable.toWeb(sshProcess.stdout) as unknown as ReadableStream<Uint8Array>;
    const stderr = Readable.toWeb(sshProcess.stderr) as unknown as ReadableStream<Uint8Array>;
    const stdin = Writable.toWeb(sshProcess.stdin) as unknown as WritableStream<Uint8Array>;

    // Create promises for exit code and duration
    const exitCode = new Promise<number>((resolve, reject) => {
      sshProcess.on("close", (code, signal) => {
        if (options.abortSignal?.aborted) {
          reject(new RuntimeErrorClass("Command execution was aborted", "exec"));
          return;
        }
        if (signal === "SIGTERM" && options.timeout !== undefined) {
          reject(
            new RuntimeErrorClass(`Command exceeded timeout of ${options.timeout} seconds`, "exec")
          );
          return;
        }
        resolve(code ?? (signal ? -1 : 0));
      });

      sshProcess.on("error", (err) => {
        reject(new RuntimeErrorClass(`Failed to execute SSH command: ${err.message}`, "exec", err));
      });
    });

    const duration = exitCode.then(() => performance.now() - startTime);

    // Handle abort signal
    if (options.abortSignal) {
      options.abortSignal.addEventListener("abort", () => sshProcess.kill());
    }

    // Handle timeout
    if (options.timeout !== undefined) {
      setTimeout(() => sshProcess.kill(), options.timeout * 1000);
    }

    return { stdout, stderr, stdin, exitCode, duration };
  }

  /**
   * Read file contents over SSH as a stream
   */
  readFile(path: string): ReadableStream<Uint8Array> {
    const stream = this.exec(`cat ${JSON.stringify(path)}`, {
      cwd: this.config.workdir,
      timeout: 300, // 5 minutes - reasonable for large files
    });

    // Return stdout, but wrap to handle errors from exit code
    return new ReadableStream<Uint8Array>({
      async start(controller: ReadableStreamDefaultController<Uint8Array>) {
        try {
          const reader = stream.stdout.getReader();
          const exitCode = stream.exitCode;

          // Read all chunks
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }

          // Check exit code after reading completes
          const code = await exitCode;
          if (code !== 0) {
            const stderr = await streamToString(stream.stderr);
            throw new RuntimeErrorClass(`Failed to read file ${path}: ${stderr}`, "file_io");
          }

          controller.close();
        } catch (err) {
          if (err instanceof RuntimeErrorClass) {
            controller.error(err);
          } else {
            controller.error(
              new RuntimeErrorClass(
                `Failed to read file ${path}: ${err instanceof Error ? err.message : String(err)}`,
                "file_io",
                err instanceof Error ? err : undefined
              )
            );
          }
        }
      },
    });
  }

  /**
   * Write file contents over SSH atomically from a stream
   */
  writeFile(path: string): WritableStream<Uint8Array> {
    const tempPath = `${path}.tmp.${Date.now()}`;
    // Create parent directory if needed, then write file atomically
    const writeCommand = `mkdir -p $(dirname ${JSON.stringify(path)}) && cat > ${JSON.stringify(tempPath)} && chmod 600 ${JSON.stringify(tempPath)} && mv ${JSON.stringify(tempPath)} ${JSON.stringify(path)}`;

    const stream = this.exec(writeCommand, {
      cwd: this.config.workdir,
      timeout: 300, // 5 minutes - reasonable for large files
    });

    // Wrap stdin to handle errors from exit code
    return new WritableStream<Uint8Array>({
      async write(chunk: Uint8Array) {
        const writer = stream.stdin.getWriter();
        try {
          await writer.write(chunk);
        } finally {
          writer.releaseLock();
        }
      },
      async close() {
        // Close stdin and wait for command to complete
        await stream.stdin.close();
        const exitCode = await stream.exitCode;

        if (exitCode !== 0) {
          const stderr = await streamToString(stream.stderr);
          throw new RuntimeErrorClass(`Failed to write file ${path}: ${stderr}`, "file_io");
        }
      },
      async abort(reason?: unknown) {
        await stream.stdin.abort();
        throw new RuntimeErrorClass(`Failed to write file ${path}: ${String(reason)}`, "file_io");
      },
    });
  }

  /**
   * Get file statistics over SSH
   */
  async stat(path: string): Promise<FileStat> {
    // Use stat with format string to get: size, mtime, type
    // %s = size, %Y = mtime (seconds since epoch), %F = file type
    const stream = this.exec(`stat -c '%s %Y %F' ${JSON.stringify(path)}`, {
      cwd: this.config.workdir,
      timeout: 10, // 10 seconds - stat should be fast
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      streamToString(stream.stdout),
      streamToString(stream.stderr),
      stream.exitCode,
    ]);

    if (exitCode !== 0) {
      throw new RuntimeErrorClass(`Failed to stat ${path}: ${stderr}`, "file_io");
    }

    const parts = stdout.trim().split(" ");
    if (parts.length < 3) {
      throw new RuntimeErrorClass(`Failed to parse stat output for ${path}: ${stdout}`, "file_io");
    }

    const size = parseInt(parts[0], 10);
    const mtime = parseInt(parts[1], 10);
    const fileType = parts.slice(2).join(" ");

    return {
      size,
      modifiedTime: new Date(mtime * 1000),
      isDirectory: fileType === "directory",
    };
  }

  /**
   * Build common SSH arguments based on runtime config
   * @param includeHost - Whether to include the host in the args (for direct ssh commands)
   */
  private buildSSHArgs(includeHost = false): string[] {
    const args: string[] = [];

    // Add port if specified
    if (this.config.port) {
      args.push("-p", this.config.port.toString());
    }

    // Add identity file if specified
    if (this.config.identityFile) {
      args.push("-i", this.config.identityFile);
      // Disable strict host key checking for test environments
      args.push("-o", "StrictHostKeyChecking=no");
      args.push("-o", "UserKnownHostsFile=/dev/null");
      args.push("-o", "LogLevel=ERROR");
    }

    if (includeHost) {
      args.push(this.config.host);
    }

    return args;
  }

  /**
   * Build SSH command string for rsync's -e flag
   * Returns format like: "ssh -p 2222 -i key -o Option=value"
   */
  private buildRsyncSSHCommand(): string {
    const sshOpts: string[] = [];

    if (this.config.port) {
      sshOpts.push(`-p ${this.config.port}`);
    }
    if (this.config.identityFile) {
      sshOpts.push(`-i ${this.config.identityFile}`);
      sshOpts.push("-o StrictHostKeyChecking=no");
      sshOpts.push("-o UserKnownHostsFile=/dev/null");
      sshOpts.push("-o LogLevel=ERROR");
    }

    return sshOpts.length > 0 ? `ssh ${sshOpts.join(" ")}` : "ssh";
  }

  /**
   * Build SSH target string for rsync/scp
   */
  private buildSSHTarget(): string {
    return `${this.config.host}:${this.config.workdir}`;
  }

  /**
   * Check if error indicates command not found
   */
  private isCommandNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return msg.includes("command not found") || msg.includes("not found") || msg.includes("enoent");
  }

  /**
   * Sync project to remote using rsync (with scp fallback)
   */
  private async syncProjectToRemote(projectPath: string, initLogger: InitLogger): Promise<void> {
    // Try rsync first
    try {
      await this.rsyncProject(projectPath, initLogger);
      return;
    } catch (error) {
      // Check if error is "command not found"
      if (this.isCommandNotFoundError(error)) {
        log.info("rsync not available, falling back to scp");
        initLogger.logStep("rsync not available, using tar+ssh instead");
        await this.scpProject(projectPath, initLogger);
        return;
      }
      // Re-throw other errors (network, permissions, etc.)
      throw error;
    }
  }

  /**
   * Sync project using rsync
   */
  private async rsyncProject(projectPath: string, initLogger: InitLogger): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const args = ["-az", "--delete", `${projectPath}/`, `${this.buildSSHTarget()}`];

      // Add SSH options for rsync
      const sshCommand = this.buildRsyncSSHCommand();
      if (sshCommand !== "ssh") {
        args.splice(2, 0, "-e", sshCommand);
      }

      const rsyncProc = spawn("rsync", args);

      let stderr = "";
      rsyncProc.stderr.on("data", (data: Buffer) => {
        const msg = data.toString();
        stderr += msg;
        // Stream rsync errors to logger
        initLogger.logStderr(msg.trim());
      });

      rsyncProc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`rsync failed with exit code ${code ?? "unknown"}: ${stderr}`));
        }
      });

      rsyncProc.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Sync project using tar over ssh
   * More reliable than scp for syncing directory contents
   */
  private async scpProject(projectPath: string, initLogger: InitLogger): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Build SSH args
      const sshArgs = this.buildSSHArgs(true);

      // For paths starting with ~/, expand to $HOME
      let remoteWorkdir: string;
      if (this.config.workdir.startsWith("~/")) {
        const pathWithoutTilde = this.config.workdir.slice(2);
        remoteWorkdir = `"\\\\$HOME/${pathWithoutTilde}"`; // Escape $ so local shell doesn't expand it
      } else {
        remoteWorkdir = JSON.stringify(this.config.workdir);
      }

      // Use bash to tar and pipe over ssh
      // This is more reliable than scp for directory contents
      const command = `cd ${JSON.stringify(projectPath)} && tar -cf - . | ssh ${sshArgs.join(" ")} "cd ${remoteWorkdir} && tar -xf -"`;

      const proc = spawn("bash", ["-c", command]);

      let stderr = "";
      proc.stderr.on("data", (data: Buffer) => {
        const msg = data.toString();
        stderr += msg;
        // Stream tar/ssh errors to logger
        initLogger.logStderr(msg.trim());
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tar+ssh failed with exit code ${code ?? "unknown"}: ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Run .cmux/init hook on remote machine if it exists
   */
  private async runInitHook(projectPath: string, initLogger: InitLogger): Promise<void> {
    // Check if hook exists locally (we synced the project, so local check is sufficient)
    const hookExists = await checkInitHookExists(projectPath);
    if (!hookExists) {
      return;
    }

    const remoteHookPath = `${this.config.workdir}/.cmux/init`;
    initLogger.logStep(`Running init hook: ${remoteHookPath}`);

    // Run hook remotely and stream output
    const hookStream = this.exec(`"${remoteHookPath}"`, {
      cwd: this.config.workdir,
      timeout: 300, // 5 minutes for init hook
    });

    // Create line-buffered loggers
    const loggers = createLineBufferedLoggers(initLogger);

    // Stream stdout/stderr through line-buffered loggers
    const stdoutReader = hookStream.stdout.getReader();
    const stderrReader = hookStream.stderr.getReader();
    const decoder = new TextDecoder();

    // Read stdout in parallel
    const readStdout = async () => {
      try {
        while (true) {
          const { done, value } = await stdoutReader.read();
          if (done) break;
          loggers.stdout.append(decoder.decode(value, { stream: true }));
        }
        loggers.stdout.flush();
      } finally {
        stdoutReader.releaseLock();
      }
    };

    // Read stderr in parallel
    const readStderr = async () => {
      try {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;
          loggers.stderr.append(decoder.decode(value, { stream: true }));
        }
        loggers.stderr.flush();
      } finally {
        stderrReader.releaseLock();
      }
    };

    // Wait for completion
    const [exitCode] = await Promise.all([hookStream.exitCode, readStdout(), readStderr()]);

    initLogger.logComplete(exitCode);
  }

  async createWorkspace(params: WorkspaceCreationParams): Promise<WorkspaceCreationResult> {
    try {
      const { projectPath, branchName, trunkBranch, initLogger } = params;

      // 1. Create remote directory
      initLogger.logStep("Creating remote directory...");
      try {
        // For paths starting with ~/, expand to $HOME
        let mkdirCommand: string;
        if (this.config.workdir.startsWith("~/")) {
          const pathWithoutTilde = this.config.workdir.slice(2);
          mkdirCommand = `mkdir -p "$HOME/${pathWithoutTilde}"`;
        } else {
          mkdirCommand = `mkdir -p ${JSON.stringify(this.config.workdir)}`;
        }
        const mkdirStream = this.exec(mkdirCommand, {
          cwd: "/tmp",
          timeout: 10,
        });
        const mkdirExitCode = await mkdirStream.exitCode;
        if (mkdirExitCode !== 0) {
          const stderr = await streamToString(mkdirStream.stderr);
          return {
            success: false,
            error: `Failed to create remote directory: ${stderr}`,
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `Failed to create remote directory: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      // 2. Sync project to remote (opportunistic rsync with scp fallback)
      initLogger.logStep("Syncing project files to remote...");
      try {
        await this.syncProjectToRemote(projectPath, initLogger);
      } catch (error) {
        return {
          success: false,
          error: `Failed to sync project: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      initLogger.logStep("Files synced successfully");

      // 3. Checkout branch remotely
      initLogger.logStep(`Checking out branch: ${branchName}`);
      // No need for explicit cd here - exec() handles cwd
      const checkoutCmd = `(git checkout ${JSON.stringify(branchName)} 2>/dev/null || git checkout -b ${JSON.stringify(branchName)} ${JSON.stringify(trunkBranch)})`;

      const checkoutStream = this.exec(checkoutCmd, {
        cwd: this.config.workdir,
        timeout: 60,
      });

      const [stdout, stderr, exitCode] = await Promise.all([
        streamToString(checkoutStream.stdout),
        streamToString(checkoutStream.stderr),
        checkoutStream.exitCode,
      ]);

      if (exitCode !== 0) {
        return {
          success: false,
          error: `Failed to checkout branch: ${stderr || stdout}`,
        };
      }
      initLogger.logStep("Branch checked out successfully");

      // 4. Run .cmux/init hook if it exists
      await this.runInitHook(projectPath, initLogger);

      return {
        success: true,
        workspacePath: this.config.workdir,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Helper to convert a ReadableStream to a string
 */
async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

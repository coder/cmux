import { spawn } from "child_process";
import { Readable, Writable } from "stream";
import type {
  Runtime,
  ExecOptions,
  ExecStream,
  FileStat,
  WorkspaceCreationParams,
  WorkspaceCreationResult,
  WorkspaceInitParams,
  WorkspaceInitResult,
  InitLogger,
} from "./Runtime";
import { RuntimeError as RuntimeErrorClass } from "./Runtime";
import { EXIT_CODE_ABORTED, EXIT_CODE_TIMEOUT } from "../constants/exitCodes";
import { log } from "../services/log";
import { checkInitHookExists, createLineBufferedLoggers } from "./initHook";
import { streamProcessToLogger } from "./streamProcess";

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
   * Expand tilde in path for use in remote commands
   * Bash doesn't expand ~ when it's inside quotes, so we need to do it manually
   */
  private expandTilde(path: string): string {
    if (path === "~") {
      return "$HOME";
    } else if (path.startsWith("~/")) {
      return "$HOME/" + path.slice(2);
    }
    return path;
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

    // Expand ~/path to $HOME/path before quoting (~ doesn't expand in quotes)
    const cwd = this.expandTilde(options.cwd);

    // Build full command with cwd and env
    const fullCommand = `cd ${JSON.stringify(cwd)} && ${envPrefix}${command}`;

    // Wrap command in bash to ensure bash execution regardless of user's default shell
    // This prevents issues with fish, zsh, or other non-bash shells
    const remoteCommand = `bash -c ${JSON.stringify(fullCommand)}`;

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

    // Track if we killed the process due to timeout
    let timedOut = false;

    // Create promises for exit code and duration
    // Uses special exit codes (EXIT_CODE_ABORTED, EXIT_CODE_TIMEOUT) for expected error conditions
    const exitCode = new Promise<number>((resolve, reject) => {
      sshProcess.on("close", (code, signal) => {
        // Check abort first (highest priority)
        if (options.abortSignal?.aborted) {
          resolve(EXIT_CODE_ABORTED);
          return;
        }
        // Check if we killed the process due to timeout
        // Don't check signal - if we set timedOut, we timed out regardless of how process died
        if (timedOut) {
          resolve(EXIT_CODE_TIMEOUT);
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
      setTimeout(() => {
        timedOut = true;
        sshProcess.kill();
      }, options.timeout * 1000);
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
   * Sync project to remote using git bundle
   * 
   * Uses `git bundle` to create a packfile and clones it on the remote.
   * 
   * Benefits over git archive:
   * - Creates a real git repository on remote (can run git commands)
   * - Better parity with git worktrees (full .git directory with metadata)
   * - Enables remote git operations (commit, branch, status, diff, etc.)
   * - Only tracked files in checkout (no node_modules, build artifacts)
   * - Includes full history for flexibility
   * 
   * Benefits over rsync/scp:
   * - Much faster (only tracked files)
   * - No external dependencies (git is always available)
   * - Simpler implementation
   */
  private async syncProjectToRemote(projectPath: string, initLogger: InitLogger): Promise<void> {
    // Use timestamp-based bundle path to avoid conflicts (simpler than $$)
    const timestamp = Date.now();
    const bundleTempPath = `~/.cmux-bundle-${timestamp}.bundle`;

    try {
      // Step 1: Create bundle locally and pipe to remote file via SSH
      initLogger.logStep(`Creating git bundle...`);
      await new Promise<void>((resolve, reject) => {
        const sshArgs = this.buildSSHArgs(true);
        const command = `cd ${JSON.stringify(projectPath)} && git bundle create - --all | ssh ${sshArgs.join(" ")} "cat > ${bundleTempPath}"`;

        log.debug(`Creating bundle: ${command}`);
        const proc = spawn("bash", ["-c", command]);

        streamProcessToLogger(proc, initLogger, {
          logStdout: false,
          logStderr: true,
        });

        let stderr = "";
        proc.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Failed to create bundle: ${stderr}`));
          }
        });

        proc.on("error", (err) => {
          reject(err);
        });
      });

      // Step 2: Clone from bundle on remote using this.exec (handles tilde expansion)
      initLogger.logStep(`Cloning repository on remote...`);
      const expandedWorkdir = this.expandTilde(this.config.workdir);
      const cloneStream = this.exec(`git clone --quiet ${bundleTempPath} ${JSON.stringify(expandedWorkdir)}`, {
        cwd: "~",
        timeout: 300, // 5 minutes for clone
      });

      const [cloneStdout, cloneStderr, cloneExitCode] = await Promise.all([
        streamToString(cloneStream.stdout),
        streamToString(cloneStream.stderr),
        cloneStream.exitCode,
      ]);

      if (cloneExitCode !== 0) {
        throw new Error(`Failed to clone repository: ${cloneStderr || cloneStdout}`);
      }

      // Step 3: Remove bundle file
      initLogger.logStep(`Cleaning up bundle file...`);
      const rmStream = this.exec(`rm ${bundleTempPath}`, {
        cwd: "~",
        timeout: 10,
      });

      const rmExitCode = await rmStream.exitCode;
      if (rmExitCode !== 0) {
        log.info(`Failed to remove bundle file ${bundleTempPath}, but continuing`);
      }

      initLogger.logStep(`Repository cloned successfully`);
    } catch (error) {
      // Try to clean up bundle file on error
      try {
        const rmStream = this.exec(`rm -f ${bundleTempPath}`, {
          cwd: "~",
          timeout: 10,
        });
        await rmStream.exitCode;
      } catch {
        // Ignore cleanup errors
      }

      throw error;
    }
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

    // Expand tilde in workdir path before constructing hook path
    const expandedWorkdir = this.expandTilde(this.config.workdir);
    const remoteHookPath = `${expandedWorkdir}/.cmux/init`;
    initLogger.logStep(`Running init hook: ${remoteHookPath}`);

    // Run hook remotely and stream output
    // No timeout - user init hooks can be arbitrarily long
    const hookStream = this.exec(`"${remoteHookPath}"`, {
      cwd: this.config.workdir,
      timeout: 3600, // 1 hour - generous timeout for init hooks
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
      const { initLogger } = params;

      // Prepare parent directory for git clone (fast - returns immediately)
      // Note: git clone will create the workspace directory itself during initWorkspace,
      // but the parent directory must exist first
      initLogger.logStep("Preparing remote workspace...");
      try {
        // Get parent directory path
        // For paths starting with ~/, expand to $HOME
        let parentDirCommand: string;
        if (this.config.workdir.startsWith("~/")) {
          const pathWithoutTilde = this.config.workdir.slice(2);
          // Extract parent: /a/b/c -> /a/b
          const lastSlash = pathWithoutTilde.lastIndexOf("/");
          if (lastSlash > 0) {
            const parentPath = pathWithoutTilde.substring(0, lastSlash);
            parentDirCommand = `mkdir -p "$HOME/${parentPath}"`;
          } else {
            // If no slash, parent is HOME itself (already exists)
            parentDirCommand = "echo 'Using HOME as parent'";
          }
        } else {
          // Extract parent from absolute path
          const lastSlash = this.config.workdir.lastIndexOf("/");
          if (lastSlash > 0) {
            const parentPath = this.config.workdir.substring(0, lastSlash);
            parentDirCommand = `mkdir -p ${JSON.stringify(parentPath)}`;
          } else {
            // Root directory (shouldn't happen, but handle it)
            parentDirCommand = "echo 'Using root as parent'";
          }
        }

        const mkdirStream = this.exec(parentDirCommand, {
          cwd: "/tmp",
          timeout: 10,
        });
        const mkdirExitCode = await mkdirStream.exitCode;
        if (mkdirExitCode !== 0) {
          const stderr = await streamToString(mkdirStream.stderr);
          return {
            success: false,
            error: `Failed to prepare remote workspace: ${stderr}`,
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `Failed to prepare remote workspace: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      initLogger.logStep("Remote workspace prepared");

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

  async initWorkspace(params: WorkspaceInitParams): Promise<WorkspaceInitResult> {
    const { projectPath, branchName, trunkBranch, initLogger } = params;

    try {
      // 1. Sync project to remote (opportunistic rsync with scp fallback)
      initLogger.logStep("Syncing project files to remote...");
      try {
        await this.syncProjectToRemote(projectPath, initLogger);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        initLogger.logStderr(`Failed to sync project: ${errorMsg}`);
        initLogger.logComplete(-1);
        return {
          success: false,
          error: `Failed to sync project: ${errorMsg}`,
        };
      }
      initLogger.logStep("Files synced successfully");

      // 2. Checkout branch remotely
      // Note: After git clone, HEAD is already checked out to the default branch from the bundle
      // We create new branches from HEAD instead of the trunkBranch name to avoid issues
      // where the local repo's trunk name doesn't match the cloned repo's default branch
      initLogger.logStep(`Checking out branch: ${branchName}`);
      const checkoutCmd = `(git checkout ${JSON.stringify(branchName)} 2>/dev/null || git checkout -b ${JSON.stringify(branchName)} HEAD)`;

      const checkoutStream = this.exec(checkoutCmd, {
        cwd: this.config.workdir,
        timeout: 300, // 5 minutes for git checkout (can be slow on large repos)
      });

      const [stdout, stderr, exitCode] = await Promise.all([
        streamToString(checkoutStream.stdout),
        streamToString(checkoutStream.stderr),
        checkoutStream.exitCode,
      ]);

      if (exitCode !== 0) {
        const errorMsg = `Failed to checkout branch: ${stderr || stdout}`;
        initLogger.logStderr(errorMsg);
        initLogger.logComplete(-1);
        return {
          success: false,
          error: errorMsg,
        };
      }
      initLogger.logStep("Branch checked out successfully");

      // 3. Run .cmux/init hook if it exists
      // Note: runInitHook calls logComplete() internally if hook exists
      const hookExists = await checkInitHookExists(projectPath);
      if (hookExists) {
        await this.runInitHook(projectPath, initLogger);
      } else {
        // No hook - signal completion immediately
        initLogger.logComplete(0);
      }

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      initLogger.logStderr(`Initialization failed: ${errorMsg}`);
      initLogger.logComplete(-1);
      return {
        success: false,
        error: errorMsg,
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

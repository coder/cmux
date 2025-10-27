import { spawn } from "child_process";
import { Readable, Writable } from "stream";
import * as path from "path";
import { Shescape } from "shescape";
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
import { expandTildeForSSH, cdCommandForSSH } from "./tildeExpansion";
import { getProjectName } from "../utils/runtime/helpers";
import { getErrorMessage } from "../utils/errors";
import { execAsync } from "../utils/disposableExec";
import { getControlPath } from "./sshConnectionPool";

/**
 * Shescape instance for bash shell escaping.
 * Reused across all SSH runtime operations for performance.
 */
const shescape = new Shescape({ shell: "bash" });

/**
 * SSH Runtime Configuration
 */
export interface SSHRuntimeConfig {
  /** SSH host (can be hostname, user@host, or SSH config alias) */
  host: string;
  /** Working directory on remote host */
  srcBaseDir: string;
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
  private readonly controlPath: string;

  constructor(config: SSHRuntimeConfig) {
    // Note: srcBaseDir may contain tildes - they will be resolved via resolvePath() before use
    // The WORKSPACE_CREATE IPC handler resolves paths before storing in config
    this.config = config;
    // Get deterministic controlPath from connection pool
    // Multiple SSHRuntime instances with same config share the same controlPath,
    // enabling ControlMaster to multiplex SSH connections across operations
    this.controlPath = getControlPath(config);
  }

  /**
   * Execute command over SSH with streaming I/O
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async exec(command: string, options: ExecOptions): Promise<ExecStream> {
    const startTime = performance.now();

    // Build command parts
    const parts: string[] = [];

    // Add cd command if cwd is specified
    parts.push(cdCommandForSSH(options.cwd));

    // Add environment variable exports
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        parts.push(`export ${key}=${shescape.quote(value)}`);
      }
    }

    // Add the actual command
    parts.push(command);

    // Join all parts with && to ensure each step succeeds before continuing
    const fullCommand = parts.join(" && ");

    // Wrap in bash -c with shescape for safe shell execution
    const remoteCommand = `bash -c ${shescape.quote(fullCommand)}`;

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

    // Enable SSH connection multiplexing for better performance and to avoid
    // exhausting connection limits when running many concurrent operations
    // ControlMaster=auto: Create master connection if none exists, otherwise reuse
    // ControlPath: Unix socket path for multiplexing
    // ControlPersist=60: Keep master connection alive for 60s after last session
    sshArgs.push("-o", "ControlMaster=auto");
    sshArgs.push("-o", `ControlPath=${this.controlPath}`);
    sshArgs.push("-o", "ControlPersist=60");

    sshArgs.push(this.config.host, remoteCommand);

    // Debug: log the actual SSH command being executed
    log.debug(`SSH command: ssh ${sshArgs.join(" ")}`);
    log.debug(`Remote command: ${remoteCommand}`);

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
    // Return stdout, but wrap to handle errors from exec() and exit code
    return new ReadableStream<Uint8Array>({
      start: async (controller: ReadableStreamDefaultController<Uint8Array>) => {
        try {
          const stream = await this.exec(`cat ${shescape.quote(path)}`, {
            cwd: this.config.srcBaseDir,
            timeout: 300, // 5 minutes - reasonable for large files
          });

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
    // Use shescape.quote for safe path escaping
    const writeCommand = `mkdir -p $(dirname ${shescape.quote(path)}) && cat > ${shescape.quote(tempPath)} && chmod 600 ${shescape.quote(tempPath)} && mv ${shescape.quote(tempPath)} ${shescape.quote(path)}`;

    // Need to get the exec stream in async callbacks
    let execPromise: Promise<ExecStream> | null = null;

    const getExecStream = () => {
      execPromise ??= this.exec(writeCommand, {
        cwd: this.config.srcBaseDir,
        timeout: 300, // 5 minutes - reasonable for large files
      });
      return execPromise;
    };

    // Wrap stdin to handle errors from exit code
    return new WritableStream<Uint8Array>({
      write: async (chunk: Uint8Array) => {
        const stream = await getExecStream();
        const writer = stream.stdin.getWriter();
        try {
          await writer.write(chunk);
        } finally {
          writer.releaseLock();
        }
      },
      close: async () => {
        const stream = await getExecStream();
        // Close stdin and wait for command to complete
        await stream.stdin.close();
        const exitCode = await stream.exitCode;

        if (exitCode !== 0) {
          const stderr = await streamToString(stream.stderr);
          throw new RuntimeErrorClass(`Failed to write file ${path}: ${stderr}`, "file_io");
        }
      },
      abort: async (reason?: unknown) => {
        const stream = await getExecStream();
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
    const stream = await this.exec(`stat -c '%s %Y %F' ${shescape.quote(path)}`, {
      cwd: this.config.srcBaseDir,
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
  async resolvePath(filePath: string): Promise<string> {
    // Use shell to expand tildes and normalize path on remote system
    // Uses bash to expand ~ and readlink -m to normalize without checking existence
    // readlink -m canonicalizes the path (handles .., ., //) without requiring it to exist
    const command = `bash -c 'readlink -m ${shescape.quote(filePath)}'`;
    return this.execSSHCommand(command);
  }

  /**
   * Execute a simple SSH command and return stdout
   * @private
   */
  private async execSSHCommand(command: string): Promise<string> {
    const sshArgs = this.buildSSHArgs();
    sshArgs.push(this.config.host, command);

    return new Promise((resolve, reject) => {
      const proc = spawn("ssh", sshArgs);
      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new RuntimeErrorClass(`SSH command failed: ${stderr.trim()}`, "network"));
          return;
        }

        const output = stdout.trim();
        resolve(output);
      });

      proc.on("error", (err) => {
        reject(
          new RuntimeErrorClass(
            `Cannot execute SSH command: ${getErrorMessage(err)}`,
            "network",
            err instanceof Error ? err : undefined
          )
        );
      });
    });
  }

  normalizePath(targetPath: string, basePath: string): string {
    // For SSH, handle paths in a POSIX-like manner without accessing the remote filesystem
    const target = targetPath.trim();
    let base = basePath.trim();

    // Normalize base path - remove trailing slash (except for root "/")
    if (base.length > 1 && base.endsWith("/")) {
      base = base.slice(0, -1);
    }

    // Handle special case: current directory
    if (target === ".") {
      return base;
    }

    // Handle tilde expansion - keep as-is for comparison
    let normalizedTarget = target;
    if (target === "~" || target.startsWith("~/")) {
      normalizedTarget = target;
    } else if (target.startsWith("/")) {
      // Absolute path - use as-is
      normalizedTarget = target;
    } else {
      // Relative path - resolve against base using POSIX path joining
      normalizedTarget = base.endsWith("/") ? base + target : base + "/" + target;
    }

    // Remove trailing slash for comparison (except for root "/")
    if (normalizedTarget.length > 1 && normalizedTarget.endsWith("/")) {
      normalizedTarget = normalizedTarget.slice(0, -1);
    }

    return normalizedTarget;
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

    // Add ControlMaster options for connection multiplexing
    // This ensures git bundle transfers also reuse the master connection
    args.push("-o", "ControlMaster=auto");
    args.push("-o", `ControlPath=${this.controlPath}`);
    args.push("-o", "ControlPersist=60");

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
  private async syncProjectToRemote(
    projectPath: string,
    workspacePath: string,
    initLogger: InitLogger
  ): Promise<void> {
    // Use timestamp-based bundle path to avoid conflicts (simpler than $$)
    const timestamp = Date.now();
    const bundleTempPath = `~/.cmux-bundle-${timestamp}.bundle`;

    try {
      // Step 1: Get origin URL from local repository (if it exists)
      let originUrl: string | null = null;
      try {
        using proc = execAsync(
          `cd ${shescape.quote(projectPath)} && git remote get-url origin 2>/dev/null || true`
        );
        const { stdout } = await proc.result;
        const url = stdout.trim();
        // Only use URL if it's not a bundle path (avoids propagating bundle paths)
        if (url && !url.includes(".bundle") && !url.includes(".cmux-bundle")) {
          originUrl = url;
        }
      } catch (error) {
        // If we can't get origin, continue without it
        initLogger.logStderr(`Could not get origin URL: ${getErrorMessage(error)}`);
      }

      // Step 2: Create bundle locally and pipe to remote file via SSH
      initLogger.logStep(`Creating git bundle...`);
      await new Promise<void>((resolve, reject) => {
        const sshArgs = this.buildSSHArgs(true);
        const command = `cd ${shescape.quote(projectPath)} && git bundle create - --all | ssh ${sshArgs.join(" ")} "cat > ${bundleTempPath}"`;

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

      // Step 3: Clone from bundle on remote using this.exec
      initLogger.logStep(`Cloning repository on remote...`);

      // Expand tilde in destination path for git clone
      // git doesn't expand tilde when it's quoted, so we need to expand it ourselves
      const cloneDestPath = expandTildeForSSH(workspacePath);

      const cloneStream = await this.exec(`git clone --quiet ${bundleTempPath} ${cloneDestPath}`, {
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

      // Step 4: Create local tracking branches for all remote branches
      // This ensures that branch names like "custom-trunk" can be used directly
      // in git checkout commands, rather than needing "origin/custom-trunk"
      initLogger.logStep(`Creating local tracking branches...`);
      const createTrackingBranchesStream = await this.exec(
        `cd ${cloneDestPath} && for branch in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | grep -v 'origin/HEAD'); do localname=\${branch#origin/}; git show-ref --verify --quiet refs/heads/$localname || git branch $localname $branch; done`,
        {
          cwd: "~",
          timeout: 30,
        }
      );
      await createTrackingBranchesStream.exitCode;
      // Don't fail if this fails - some branches may already exist

      // Step 5: Update origin remote if we have an origin URL
      if (originUrl) {
        initLogger.logStep(`Setting origin remote to ${originUrl}...`);
        const setOriginStream = await this.exec(
          `git -C ${cloneDestPath} remote set-url origin ${shescape.quote(originUrl)}`,
          {
            cwd: "~",
            timeout: 10,
          }
        );

        const setOriginExitCode = await setOriginStream.exitCode;
        if (setOriginExitCode !== 0) {
          const stderr = await streamToString(setOriginStream.stderr);
          log.info(`Failed to set origin remote: ${stderr}`);
          // Continue anyway - this is not fatal
        }
      } else {
        // No origin in local repo, remove the origin that points to bundle
        initLogger.logStep(`Removing bundle origin remote...`);
        const removeOriginStream = await this.exec(
          `git -C ${cloneDestPath} remote remove origin 2>/dev/null || true`,
          {
            cwd: "~",
            timeout: 10,
          }
        );
        await removeOriginStream.exitCode;
      }

      // Step 5: Remove bundle file
      initLogger.logStep(`Cleaning up bundle file...`);
      const rmStream = await this.exec(`rm ${bundleTempPath}`, {
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
        const rmStream = await this.exec(`rm -f ${bundleTempPath}`, {
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
  private async runInitHook(
    projectPath: string,
    workspacePath: string,
    initLogger: InitLogger
  ): Promise<void> {
    // Check if hook exists locally (we synced the project, so local check is sufficient)
    const hookExists = await checkInitHookExists(projectPath);
    if (!hookExists) {
      return;
    }

    // Construct hook path - expand tilde if present
    const remoteHookPath = `${workspacePath}/.cmux/init`;
    initLogger.logStep(`Running init hook: ${remoteHookPath}`);

    // Expand tilde in hook path for execution
    // Tilde won't be expanded when the path is quoted, so we need to expand it ourselves
    const hookCommand = expandTildeForSSH(remoteHookPath);

    // Run hook remotely and stream output
    // No timeout - user init hooks can be arbitrarily long
    const hookStream = await this.exec(hookCommand, {
      cwd: workspacePath, // Run in the workspace directory
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

  getWorkspacePath(projectPath: string, workspaceName: string): string {
    const projectName = getProjectName(projectPath);
    return path.posix.join(this.config.srcBaseDir, projectName, workspaceName);
  }

  async createWorkspace(params: WorkspaceCreationParams): Promise<WorkspaceCreationResult> {
    try {
      const { projectPath, branchName, initLogger } = params;
      // Compute workspace path using canonical method
      const workspacePath = this.getWorkspacePath(projectPath, branchName);

      // Prepare parent directory for git clone (fast - returns immediately)
      // Note: git clone will create the workspace directory itself during initWorkspace,
      // but the parent directory must exist first
      initLogger.logStep("Preparing remote workspace...");
      try {
        // Extract parent directory from workspace path
        // Example: ~/workspace/project/branch -> ~/workspace/project
        const lastSlash = workspacePath.lastIndexOf("/");
        const parentDir = lastSlash > 0 ? workspacePath.substring(0, lastSlash) : "~";

        // Expand tilde for mkdir command
        const expandedParentDir = expandTildeForSSH(parentDir);
        const parentDirCommand = `mkdir -p ${expandedParentDir}`;

        const mkdirStream = await this.exec(parentDirCommand, {
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
          error: `Failed to prepare remote workspace: ${getErrorMessage(error)}`,
        };
      }

      initLogger.logStep("Remote workspace prepared");

      return {
        success: true,
        workspacePath,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  async initWorkspace(params: WorkspaceInitParams): Promise<WorkspaceInitResult> {
    const { projectPath, branchName, trunkBranch, workspacePath, initLogger } = params;

    try {
      // 1. Sync project to remote (opportunistic rsync with scp fallback)
      initLogger.logStep("Syncing project files to remote...");
      try {
        await this.syncProjectToRemote(projectPath, workspacePath, initLogger);
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        initLogger.logStderr(`Failed to sync project: ${errorMsg}`);
        initLogger.logComplete(-1);
        return {
          success: false,
          error: `Failed to sync project: ${errorMsg}`,
        };
      }
      initLogger.logStep("Files synced successfully");

      // 2. Checkout branch remotely
      // If branch exists locally, check it out; otherwise create it from the specified trunk branch
      // Note: We've already created local branches for all remote refs in syncProjectToRemote
      initLogger.logStep(`Checking out branch: ${branchName}`);

      // Try to checkout existing branch, or create new branch from trunk
      // Since we've created local branches for all remote refs, we can use branch names directly
      const checkoutCmd = `git checkout ${shescape.quote(branchName)} 2>/dev/null || git checkout -b ${shescape.quote(branchName)} ${shescape.quote(trunkBranch)}`;

      const checkoutStream = await this.exec(checkoutCmd, {
        cwd: workspacePath, // Use the full workspace path for git operations
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
        await this.runInitHook(projectPath, workspacePath, initLogger);
      } else {
        // No hook - signal completion immediately
        initLogger.logComplete(0);
      }

      return { success: true };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      initLogger.logStderr(`Initialization failed: ${errorMsg}`);
      initLogger.logComplete(-1);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  async renameWorkspace(
    projectPath: string,
    oldName: string,
    newName: string
  ): Promise<
    { success: true; oldPath: string; newPath: string } | { success: false; error: string }
  > {
    // Compute workspace paths using canonical method
    const oldPath = this.getWorkspacePath(projectPath, oldName);
    const newPath = this.getWorkspacePath(projectPath, newName);

    try {
      // SSH runtimes use plain directories, not git worktrees
      // Expand tilde and quote paths (expandTildeForSSH handles both expansion and quoting)
      const expandedOldPath = expandTildeForSSH(oldPath);
      const expandedNewPath = expandTildeForSSH(newPath);

      // Just use mv to rename the directory on the remote host
      const moveCommand = `mv ${expandedOldPath} ${expandedNewPath}`;

      // Execute via the runtime's exec method (handles SSH connection multiplexing, etc.)
      const stream = await this.exec(moveCommand, {
        cwd: this.config.srcBaseDir,
        timeout: 30,
      });

      await stream.stdin.close();
      const exitCode = await stream.exitCode;

      if (exitCode !== 0) {
        // Read stderr for error message
        const stderrReader = stream.stderr.getReader();
        const decoder = new TextDecoder();
        let stderr = "";
        try {
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;
            stderr += decoder.decode(value, { stream: true });
          }
        } finally {
          stderrReader.releaseLock();
        }
        return {
          success: false,
          error: `Failed to rename directory: ${stderr || "Unknown error"}`,
        };
      }

      return { success: true, oldPath, newPath };
    } catch (error) {
      return { success: false, error: `Failed to rename directory: ${getErrorMessage(error)}` };
    }
  }

  async deleteWorkspace(
    projectPath: string,
    workspaceName: string,
    force: boolean
  ): Promise<{ success: true; deletedPath: string } | { success: false; error: string }> {
    // Compute workspace path using canonical method
    const deletedPath = this.getWorkspacePath(projectPath, workspaceName);

    try {
      // Check if workspace exists first
      const checkExistStream = await this.exec(`test -d ${shescape.quote(deletedPath)}`, {
        cwd: this.config.srcBaseDir,
        timeout: 10,
      });

      await checkExistStream.stdin.close();
      const existsExitCode = await checkExistStream.exitCode;

      // If directory doesn't exist, deletion is a no-op (success)
      if (existsExitCode !== 0) {
        return { success: true, deletedPath };
      }

      // Check if workspace has uncommitted changes (unless force is true)
      if (!force) {
        // Check for uncommitted changes using git diff
        const checkStream = await this.exec(
          `cd ${shescape.quote(deletedPath)} && git diff --quiet --exit-code && git diff --quiet --cached --exit-code`,
          {
            cwd: this.config.srcBaseDir,
            timeout: 10,
          }
        );

        await checkStream.stdin.close();
        const checkExitCode = await checkStream.exitCode;

        if (checkExitCode !== 0) {
          // Workspace has uncommitted changes
          return {
            success: false,
            error: `Workspace contains uncommitted changes. Use force flag to delete anyway.`,
          };
        }
      }

      // SSH runtimes use plain directories, not git worktrees
      // Use rm -rf to remove the directory on the remote host
      const removeCommand = `rm -rf ${shescape.quote(deletedPath)}`;

      // Execute via the runtime's exec method (handles SSH connection multiplexing, etc.)
      const stream = await this.exec(removeCommand, {
        cwd: this.config.srcBaseDir,
        timeout: 30,
      });

      await stream.stdin.close();
      const exitCode = await stream.exitCode;

      if (exitCode !== 0) {
        // Read stderr for error message
        const stderrReader = stream.stderr.getReader();
        const decoder = new TextDecoder();
        let stderr = "";
        try {
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;
            stderr += decoder.decode(value, { stream: true });
          }
        } finally {
          stderrReader.releaseLock();
        }
        return {
          success: false,
          error: `Failed to delete directory: ${stderr || "Unknown error"}`,
        };
      }

      return { success: true, deletedPath };
    } catch (error) {
      return { success: false, error: `Failed to delete directory: ${getErrorMessage(error)}` };
    }
  }
}

/**
 * Helper to convert a ReadableStream to a string
 */
export async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
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

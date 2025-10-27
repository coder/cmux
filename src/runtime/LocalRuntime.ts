import { spawn } from "child_process";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
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
import { NON_INTERACTIVE_ENV_VARS } from "../constants/env";
import { EXIT_CODE_ABORTED, EXIT_CODE_TIMEOUT } from "../constants/exitCodes";
import { listLocalBranches } from "../git";
import { checkInitHookExists, getInitHookPath, createLineBufferedLoggers } from "./initHook";
import { execAsync } from "../utils/disposableExec";
import { getProjectName } from "../utils/runtime/helpers";
import { getErrorMessage } from "../utils/errors";

/**
 * Local runtime implementation that executes commands and file operations
 * directly on the host machine using Node.js APIs.
 */
export class LocalRuntime implements Runtime {
  private readonly srcBaseDir: string;

  constructor(srcBaseDir: string) {
    this.srcBaseDir = srcBaseDir;
  }

  async exec(command: string, options: ExecOptions): Promise<ExecStream> {
    const startTime = performance.now();

    // Use the specified working directory (must be a specific workspace path)
    const cwd = options.cwd;

    // Check if working directory exists before spawning
    // This prevents confusing ENOENT errors from spawn()
    try {
      await fsPromises.access(cwd);
    } catch (err) {
      throw new RuntimeErrorClass(
        `Working directory does not exist: ${cwd}`,
        "exec",
        err instanceof Error ? err : undefined
      );
    }

    // If niceness is specified, spawn nice directly to avoid escaping issues
    const spawnCommand = options.niceness !== undefined ? "nice" : "bash";
    const bashPath = "bash";
    const spawnArgs =
      options.niceness !== undefined
        ? ["-n", options.niceness.toString(), bashPath, "-c", command]
        : ["-c", command];

    const childProcess = spawn(spawnCommand, spawnArgs, {
      cwd,
      env: {
        ...process.env,
        ...(options.env ?? {}),
        ...NON_INTERACTIVE_ENV_VARS,
      },
      stdio: ["pipe", "pipe", "pipe"],
      // CRITICAL: Spawn as detached process group leader to enable cleanup of background processes.
      // When a bash script spawns background processes (e.g., `sleep 100 &`), we need to kill
      // the entire process group (including all backgrounded children) via process.kill(-pid).
      // NOTE: detached:true does NOT cause bash to wait for background jobs when using 'exit' event
      // instead of 'close' event. The 'exit' event fires when bash exits, ignoring background children.
      detached: true,
    });

    // Convert Node.js streams to Web Streams
    const stdout = Readable.toWeb(childProcess.stdout) as unknown as ReadableStream<Uint8Array>;
    const stderr = Readable.toWeb(childProcess.stderr) as unknown as ReadableStream<Uint8Array>;
    const stdin = Writable.toWeb(childProcess.stdin) as unknown as WritableStream<Uint8Array>;

    // Track if we killed the process due to timeout
    let timedOut = false;

    // Create promises for exit code and duration
    // Uses special exit codes (EXIT_CODE_ABORTED, EXIT_CODE_TIMEOUT) for expected error conditions
    const exitCode = new Promise<number>((resolve, reject) => {
      // Use 'exit' event instead of 'close' to handle background processes correctly.
      // The 'close' event waits for ALL child processes (including background ones) to exit,
      // which causes hangs when users spawn background processes like servers.
      // The 'exit' event fires when the main bash process exits, which is what we want.
      //
      // However, stdio streams may not be fully flushed when 'exit' fires, so we need to:
      // 1. Track when process exits and when streams close
      // 2. Resolve immediately if streams have closed
      // 3. Wait with a grace period (50ms) for streams to flush if they haven't closed yet
      // 4. Force-close streams after grace period to prevent hangs
      let stdoutClosed = false;
      let stderrClosed = false;
      let processExited = false;
      let exitedCode: number | null = null;

      // Track stream closures
      childProcess.stdout?.on("close", () => {
        stdoutClosed = true;
        tryResolve();
      });
      childProcess.stderr?.on("close", () => {
        stderrClosed = true;
        tryResolve();
      });

      const tryResolve = () => {
        // Only resolve if process has exited AND streams are closed
        if (processExited && stdoutClosed && stderrClosed) {
          finalizeExit();
        }
      };

      const finalizeExit = () => {
        // Check abort first (highest priority)
        if (options.abortSignal?.aborted) {
          resolve(EXIT_CODE_ABORTED);
          return;
        }
        // Check if we killed the process due to timeout
        if (timedOut) {
          resolve(EXIT_CODE_TIMEOUT);
          return;
        }
        resolve(exitedCode ?? 0);
      };

      childProcess.on("exit", (code) => {
        processExited = true;
        exitedCode = code;

        // Clean up any background processes (process group cleanup)
        // This prevents zombie processes when scripts spawn background tasks
        if (childProcess.pid !== undefined) {
          try {
            // Kill entire process group with SIGKILL - cannot be caught/ignored
            // Use negative PID to signal the entire process group
            process.kill(-childProcess.pid, "SIGKILL");
          } catch {
            // Process group already dead or doesn't exist - ignore
          }
        }

        // Try to resolve immediately if streams have already closed
        tryResolve();

        // Set a grace period timer - if streams don't close within 50ms, finalize anyway
        // This handles background processes that keep stdio open
        setTimeout(() => {
          if (!stdoutClosed || !stderrClosed) {
            // Mark streams as closed and finalize without destroying them
            // Destroying converted Web Streams causes errors in the conversion layer
            stdoutClosed = true;
            stderrClosed = true;
            finalizeExit();
          }
        }, 50);
      });

      childProcess.on("error", (err) => {
        reject(new RuntimeErrorClass(`Failed to execute command: ${err.message}`, "exec", err));
      });
    });

    const duration = exitCode.then(() => performance.now() - startTime);

    // Helper to kill entire process group (including background children)
    const killProcessGroup = () => {
      if (childProcess.pid === undefined) return;

      try {
        // Kill entire process group with SIGKILL - cannot be caught/ignored
        process.kill(-childProcess.pid, "SIGKILL");
      } catch {
        // Fallback: try killing just the main process
        try {
          childProcess.kill("SIGKILL");
        } catch {
          // Process already dead - ignore
        }
      }
    };

    // Handle abort signal
    if (options.abortSignal) {
      options.abortSignal.addEventListener("abort", killProcessGroup);
    }

    // Handle timeout
    if (options.timeout !== undefined) {
      setTimeout(() => {
        timedOut = true;
        killProcessGroup();
      }, options.timeout * 1000);
    }

    return { stdout, stderr, stdin, exitCode, duration };
  }

  readFile(filePath: string): ReadableStream<Uint8Array> {
    const nodeStream = fs.createReadStream(filePath);

    // Handle errors by wrapping in a transform
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

    return new ReadableStream<Uint8Array>({
      async start(controller: ReadableStreamDefaultController<Uint8Array>) {
        try {
          const reader = webStream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(
            new RuntimeErrorClass(
              `Failed to read file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
              "file_io",
              err instanceof Error ? err : undefined
            )
          );
        }
      },
    });
  }

  writeFile(filePath: string): WritableStream<Uint8Array> {
    let tempPath: string;
    let writer: WritableStreamDefaultWriter<Uint8Array>;

    return new WritableStream<Uint8Array>({
      async start() {
        // Create parent directories if they don't exist
        const parentDir = path.dirname(filePath);
        await fsPromises.mkdir(parentDir, { recursive: true });

        // Create temp file for atomic write
        tempPath = `${filePath}.tmp.${Date.now()}`;
        const nodeStream = fs.createWriteStream(tempPath);
        const webStream = Writable.toWeb(nodeStream) as WritableStream<Uint8Array>;
        writer = webStream.getWriter();
      },
      async write(chunk: Uint8Array) {
        await writer.write(chunk);
      },
      async close() {
        // Close the writer and rename to final location
        await writer.close();
        try {
          await fsPromises.rename(tempPath, filePath);
        } catch (err) {
          throw new RuntimeErrorClass(
            `Failed to write file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
            "file_io",
            err instanceof Error ? err : undefined
          );
        }
      },
      async abort(reason?: unknown) {
        // Clean up temp file on abort
        await writer.abort();
        try {
          await fsPromises.unlink(tempPath);
        } catch {
          // Ignore errors cleaning up temp file
        }
        throw new RuntimeErrorClass(
          `Failed to write file ${filePath}: ${String(reason)}`,
          "file_io"
        );
      },
    });
  }

  async stat(filePath: string): Promise<FileStat> {
    try {
      const stats = await fsPromises.stat(filePath);
      return {
        size: stats.size,
        modifiedTime: stats.mtime,
        isDirectory: stats.isDirectory(),
      };
    } catch (err) {
      throw new RuntimeErrorClass(
        `Failed to stat ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        "file_io",
        err instanceof Error ? err : undefined
      );
    }
  }

  normalizePath(targetPath: string, basePath: string): string {
    // For local runtime, use Node.js path resolution
    // Handle special case: current directory
    const target = targetPath.trim();
    if (target === ".") {
      return path.resolve(basePath);
    }
    return path.resolve(basePath, target);
  }

  getWorkspacePath(projectPath: string, workspaceName: string): string {
    const projectName = getProjectName(projectPath);
    return path.join(this.srcBaseDir, projectName, workspaceName);
  }

  async createWorkspace(params: WorkspaceCreationParams): Promise<WorkspaceCreationResult> {
    const { projectPath, branchName, trunkBranch, initLogger } = params;

    try {
      // Compute workspace path using the canonical method
      const workspacePath = this.getWorkspacePath(projectPath, branchName);
      initLogger.logStep("Creating git worktree...");

      // Create parent directory if needed
      const parentDir = path.dirname(workspacePath);
      try {
        await fsPromises.access(parentDir);
      } catch {
        await fsPromises.mkdir(parentDir, { recursive: true });
      }

      // Check if workspace already exists
      try {
        await fsPromises.access(workspacePath);
        return {
          success: false,
          error: `Workspace already exists at ${workspacePath}`,
        };
      } catch {
        // Workspace doesn't exist, proceed with creation
      }

      // Check if branch exists locally
      const localBranches = await listLocalBranches(projectPath);
      const branchExists = localBranches.includes(branchName);

      // Create worktree (git worktree is typically fast)
      if (branchExists) {
        // Branch exists, just add worktree pointing to it
        using proc = execAsync(
          `git -C "${projectPath}" worktree add "${workspacePath}" "${branchName}"`
        );
        await proc.result;
      } else {
        // Branch doesn't exist, create it from trunk
        using proc = execAsync(
          `git -C "${projectPath}" worktree add -b "${branchName}" "${workspacePath}" "${trunkBranch}"`
        );
        await proc.result;
      }

      initLogger.logStep("Worktree created successfully");

      return { success: true, workspacePath };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  async initWorkspace(params: WorkspaceInitParams): Promise<WorkspaceInitResult> {
    const { projectPath, workspacePath, initLogger } = params;

    try {
      // Run .cmux/init hook if it exists
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

  /**
   * Run .cmux/init hook if it exists and is executable
   */
  private async runInitHook(
    projectPath: string,
    workspacePath: string,
    initLogger: InitLogger
  ): Promise<void> {
    // Check if hook exists and is executable
    const hookExists = await checkInitHookExists(projectPath);
    if (!hookExists) {
      return;
    }

    const hookPath = getInitHookPath(projectPath);
    initLogger.logStep(`Running init hook: ${hookPath}`);

    // Create line-buffered loggers
    const loggers = createLineBufferedLoggers(initLogger);

    return new Promise<void>((resolve) => {
      const proc = spawn("bash", ["-c", `"${hookPath}"`], {
        cwd: workspacePath,
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.stdout.on("data", (data: Buffer) => {
        loggers.stdout.append(data.toString());
      });

      proc.stderr.on("data", (data: Buffer) => {
        loggers.stderr.append(data.toString());
      });

      proc.on("close", (code) => {
        // Flush any remaining buffered output
        loggers.stdout.flush();
        loggers.stderr.flush();

        initLogger.logComplete(code ?? 0);
        resolve();
      });

      proc.on("error", (err) => {
        initLogger.logStderr(`Error running init hook: ${err.message}`);
        initLogger.logComplete(-1);
        resolve();
      });
    });
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
      // Use git worktree move to rename the worktree directory
      // This updates git's internal worktree metadata correctly
      using proc = execAsync(`git -C "${projectPath}" worktree move "${oldPath}" "${newPath}"`);
      await proc.result;

      return { success: true, oldPath, newPath };
    } catch (error) {
      return { success: false, error: `Failed to move worktree: ${getErrorMessage(error)}` };
    }
  }

  async deleteWorkspace(
    projectPath: string,
    workspaceName: string,
    force: boolean
  ): Promise<{ success: true; deletedPath: string } | { success: false; error: string }> {
    // Compute workspace path using the canonical method
    const deletedPath = this.getWorkspacePath(projectPath, workspaceName);

    try {
      // Use git worktree remove to delete the worktree
      // This updates git's internal worktree metadata correctly
      // Only use --force if explicitly requested by the caller
      const forceFlag = force ? " --force" : "";
      using proc = execAsync(
        `git -C "${projectPath}" worktree remove${forceFlag} "${deletedPath}"`
      );
      await proc.result;

      return { success: true, deletedPath };
    } catch (error) {
      const message = getErrorMessage(error);

      // If force is enabled and git worktree remove failed, fall back to rm -rf
      // This handles edge cases like submodules where git refuses to delete
      if (force) {
        try {
          // Prune git's worktree records first (best effort)
          try {
            using pruneProc = execAsync(`git -C "${projectPath}" worktree prune`);
            await pruneProc.result;
          } catch {
            // Ignore prune errors - we'll still try rm -rf
          }

          // Force delete the directory
          using rmProc = execAsync(`rm -rf "${deletedPath}"`);
          await rmProc.result;

          return { success: true, deletedPath };
        } catch (rmError) {
          return {
            success: false,
            error: `Failed to remove worktree via git and rm: ${getErrorMessage(rmError)}`,
          };
        }
      }

      // force=false - return the git error without attempting rm -rf
      return { success: false, error: `Failed to remove worktree: ${message}` };
    }
  }
}

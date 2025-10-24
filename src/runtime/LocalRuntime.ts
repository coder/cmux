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
  InitLogger,
} from "./Runtime";
import { RuntimeError as RuntimeErrorClass } from "./Runtime";
import { NON_INTERACTIVE_ENV_VARS } from "../constants/env";
import { listLocalBranches } from "../git";
import { checkInitHookExists, getInitHookPath, createLineBufferedLoggers } from "./initHook";
import { execAsync } from "../utils/disposableExec";

/**
 * Local runtime implementation that executes commands and file operations
 * directly on the host machine using Node.js APIs.
 */
export class LocalRuntime implements Runtime {
  private readonly workdir: string;

  constructor(workdir: string) {
    this.workdir = workdir;
  }

  exec(command: string, options: ExecOptions): ExecStream {
    const startTime = performance.now();

    // If niceness is specified, spawn nice directly to avoid escaping issues
    const spawnCommand = options.niceness !== undefined ? "nice" : "bash";
    const spawnArgs =
      options.niceness !== undefined
        ? ["-n", options.niceness.toString(), "bash", "-c", command]
        : ["-c", command];

    const childProcess = spawn(spawnCommand, spawnArgs, {
      cwd: options.cwd ?? this.workdir,
      env: {
        ...process.env,
        ...(options.env ?? {}),
        ...NON_INTERACTIVE_ENV_VARS,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Convert Node.js streams to Web Streams
    const stdout = Readable.toWeb(childProcess.stdout) as unknown as ReadableStream<Uint8Array>;
    const stderr = Readable.toWeb(childProcess.stderr) as unknown as ReadableStream<Uint8Array>;
    const stdin = Writable.toWeb(childProcess.stdin) as unknown as WritableStream<Uint8Array>;

    // Create promises for exit code and duration
    const exitCode = new Promise<number>((resolve, reject) => {
      childProcess.on("close", (code, signal) => {
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

      childProcess.on("error", (err) => {
        reject(new RuntimeErrorClass(`Failed to execute command: ${err.message}`, "exec", err));
      });
    });

    const duration = exitCode.then(() => performance.now() - startTime);

    // Handle abort signal
    if (options.abortSignal) {
      options.abortSignal.addEventListener("abort", () => childProcess.kill());
    }

    // Handle timeout
    if (options.timeout !== undefined) {
      setTimeout(() => childProcess.kill(), options.timeout * 1000);
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

  async createWorkspace(params: WorkspaceCreationParams): Promise<WorkspaceCreationResult> {
    const { projectPath, branchName, trunkBranch, initLogger } = params;

    try {
      // Create workspace at workdir
      const workspacePath = this.workdir;
      initLogger.logStep("Creating git worktree...");

      // Create parent directory if needed
      const parentDir = path.dirname(workspacePath);
      // eslint-disable-next-line local/no-sync-fs-methods
      if (!fs.existsSync(parentDir)) {
        // eslint-disable-next-line local/no-sync-fs-methods
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Check if workspace already exists
      // eslint-disable-next-line local/no-sync-fs-methods
      if (fs.existsSync(workspacePath)) {
        return {
          success: false,
          error: `Workspace already exists at ${workspacePath}`,
        };
      }

      // Check if branch exists locally
      const localBranches = await listLocalBranches(projectPath);
      const branchExists = localBranches.includes(branchName);

      // Create worktree
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

      // Run .cmux/init hook if it exists
      await this.runInitHook(projectPath, workspacePath, initLogger);

      return { success: true, workspacePath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
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
}

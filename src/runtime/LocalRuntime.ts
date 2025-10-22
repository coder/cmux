import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { createInterface } from "readline";
import * as fs from "fs/promises";
import * as path from "path";
import writeFileAtomic from "write-file-atomic";
import type { Runtime, ExecOptions, ExecResult, FileStat, RuntimeError } from "./Runtime";
import { RuntimeError as RuntimeErrorClass } from "./Runtime";
import { NON_INTERACTIVE_ENV_VARS } from "../constants/env";

/**
 * Wraps a ChildProcess to make it disposable for use with `using` statements
 */
class DisposableProcess implements Disposable {
  constructor(private readonly process: ChildProcess) {}

  [Symbol.dispose](): void {
    if (!this.process.killed) {
      this.process.kill();
    }
  }

  get child(): ChildProcess {
    return this.process;
  }
}

/**
 * Local runtime implementation that executes commands and file operations
 * directly on the host machine using Node.js APIs.
 */
export class LocalRuntime implements Runtime {
  async exec(command: string, options: ExecOptions): Promise<ExecResult> {
    const startTime = performance.now();

    // Create the process with `using` for automatic cleanup
    // If niceness is specified, spawn nice directly to avoid escaping issues
    const spawnCommand = options.niceness !== undefined ? "nice" : "bash";
    const spawnArgs =
      options.niceness !== undefined
        ? ["-n", options.niceness.toString(), "bash", "-c", command]
        : ["-c", command];

    using childProcess = new DisposableProcess(
      spawn(spawnCommand, spawnArgs, {
        cwd: options.cwd,
        env: {
          ...process.env,
          // Inject provided environment variables
          ...(options.env ?? {}),
          // Prevent interactive editors and credential prompts
          ...NON_INTERACTIVE_ENV_VARS,
        },
        stdio: [options.stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
      })
    );

    // Write stdin if provided
    if (options.stdin !== undefined && childProcess.child.stdin) {
      childProcess.child.stdin.write(options.stdin);
      childProcess.child.stdin.end();
    }

    // Use a promise to wait for completion
    return await new Promise<ExecResult>((resolve, reject) => {
      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];
      let exitCode: number | null = null;
      let resolved = false;

      // Helper to resolve once
      const resolveOnce = (result: ExecResult) => {
        if (!resolved) {
          resolved = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          // Clean up abort listener if present
          if (options.abortSignal && abortListener) {
            options.abortSignal.removeEventListener("abort", abortListener);
          }
          resolve(result);
        }
      };

      const rejectOnce = (error: RuntimeError) => {
        if (!resolved) {
          resolved = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (options.abortSignal && abortListener) {
            options.abortSignal.removeEventListener("abort", abortListener);
          }
          reject(error);
        }
      };

      // Set up abort signal listener
      let abortListener: (() => void) | null = null;
      if (options.abortSignal) {
        abortListener = () => {
          if (!resolved) {
            childProcess.child.kill();
          }
        };
        options.abortSignal.addEventListener("abort", abortListener);
      }

      // Set up timeout
      let timeoutHandle: NodeJS.Timeout | null = null;
      if (options.timeout !== undefined) {
        timeoutHandle = setTimeout(() => {
          if (!resolved) {
            childProcess.child.kill();
          }
        }, options.timeout * 1000);
      }

      // Set up readline for stdout and stderr
      const stdoutReader = createInterface({ input: childProcess.child.stdout! });
      const stderrReader = createInterface({ input: childProcess.child.stderr! });

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
      childProcess.child.on("close", (code, signal) => {
        if (resolved) return;

        const duration = performance.now() - startTime;
        exitCode = code ?? (signal ? -1 : 0);

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

      childProcess.child.on("error", (err) => {
        if (!resolved) {
          rejectOnce(
            new RuntimeErrorClass(`Failed to execute command: ${err.message}`, "exec", err)
          );
        }
      });
    });
  }

  async readFile(path: string): Promise<string> {
    try {
      return await fs.readFile(path, { encoding: "utf-8" });
    } catch (err) {
      throw new RuntimeErrorClass(
        `Failed to read file ${path}: ${err instanceof Error ? err.message : String(err)}`,
        "file_io",
        err instanceof Error ? err : undefined
      );
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      // Create parent directories if they don't exist
      const parentDir = path.dirname(filePath);
      await fs.mkdir(parentDir, { recursive: true });

      // Use atomic write to prevent partial writes
      await writeFileAtomic(filePath, content, { encoding: "utf-8" });
    } catch (err) {
      throw new RuntimeErrorClass(
        `Failed to write file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        "file_io",
        err instanceof Error ? err : undefined
      );
    }
  }

  async stat(path: string): Promise<FileStat> {
    try {
      const stats = await fs.stat(path);
      return {
        size: stats.size,
        modifiedTime: stats.mtime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
      };
    } catch (err) {
      throw new RuntimeErrorClass(
        `Failed to stat ${path}: ${err instanceof Error ? err.message : String(err)}`,
        "file_io",
        err instanceof Error ? err : undefined
      );
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

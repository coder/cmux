import { exec } from "child_process";
import type { ChildProcess } from "child_process";

/**
 * Disposable wrapper for exec that ensures child process cleanup.
 * Prevents zombie processes by killing child when scope exits.
 *
 * Usage:
 *   using proc = execAsync("git status");
 *   const { stdout } = await proc.result;
 */
class DisposableExec implements Disposable {
  constructor(
    private readonly promise: Promise<{ stdout: string; stderr: string }>,
    private readonly child: ChildProcess
  ) {}

  [Symbol.dispose](): void {
    // Only kill if process hasn't exited naturally
    // Check the child's actual exit state, not promise state (avoids async timing issues)
    const hasExited = this.child.exitCode !== null || this.child.signalCode !== null;
    if (!hasExited && !this.child.killed) {
      this.child.kill();
    }
  }

  get result() {
    return this.promise;
  }
}

/**
 * Execute command with automatic cleanup via `using` declaration.
 * Prevents zombie processes by ensuring child is reaped even on error.
 *
 * @example
 * using proc = execAsync("git status");
 * const { stdout } = await proc.result;
 */
export function execAsync(command: string): DisposableExec {
  const child = exec(command);
  const promise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;
    let exitSignal: string | null = null;

    child.stdout?.on("data", (data) => {
      stdout += data;
    });
    child.stderr?.on("data", (data) => {
      stderr += data;
    });

    // Use 'close' event instead of 'exit' - close fires after all stdio streams are closed
    // This ensures we've received all buffered output before resolving/rejecting
    child.on("exit", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
    });

    child.on("close", () => {
      // Only resolve if process exited cleanly (code 0, no signal)
      if (exitCode === 0 && exitSignal === null) {
        resolve({ stdout, stderr });
      } else {
        // Include stderr in error message for better debugging
        const errorMsg =
          stderr.trim() ||
          (exitSignal
            ? `Command killed by signal ${exitSignal}`
            : `Command failed with exit code ${exitCode ?? "unknown"}`);
        const error = new Error(errorMsg) as Error & {
          code: number | null;
          signal: string | null;
          stdout: string;
          stderr: string;
        };
        error.code = exitCode;
        error.signal = exitSignal;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });

    child.on("error", reject);
  });

  return new DisposableExec(promise, child);
}

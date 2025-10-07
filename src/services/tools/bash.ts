import { tool } from "ai";
import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { createInterface } from "readline";
import * as path from "path";
import type { BashToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";

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
 * Bash execution tool factory for AI assistant
 * Creates a bash tool that can execute commands with a configurable timeout
 * @param config Required configuration including working directory
 */
export const createBashTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.bash.description + "\nRuns in " + config.cwd + " - no cd needed",
    inputSchema: TOOL_DEFINITIONS.bash.schema,
    execute: async (
      { script, timeout_secs, max_lines, stdin },
      { abortSignal }
    ): Promise<BashToolResult> => {
      const startTime = performance.now();

      // Detect redundant cd to working directory
      // Match patterns like: "cd /path &&", "cd /path;", "cd '/path' &&", "cd \"/path\" &&"
      const cdPattern = /^\s*cd\s+['"]?([^'";&|]+)['"]?\s*[;&|]/;
      const match = cdPattern.exec(script);
      if (match) {
        const targetPath = match[1].trim();
        // Normalize paths for comparison (resolve to absolute)
        const normalizedTarget = path.resolve(config.cwd, targetPath);
        const normalizedCwd = path.resolve(config.cwd);

        if (normalizedTarget === normalizedCwd) {
          return {
            success: false,
            error: `Redundant cd to working directory detected. The tool already runs in ${config.cwd} - no cd needed. Remove the 'cd ${targetPath}' prefix.`,
            exitCode: -1,
            wall_duration_ms: 0,
          };
        }
      }

      // Create the process with `using` for automatic cleanup
      using childProcess = new DisposableProcess(
        spawn("bash", ["-c", script], {
          cwd: config.cwd,
          env: {
            ...process.env,
            // Prevent interactive editors from blocking bash execution
            // This is critical for git operations like rebase/commit that try to open editors
            GIT_EDITOR: "true", // Git-specific editor (highest priority)
            GIT_SEQUENCE_EDITOR: "true", // For interactive rebase sequences
            EDITOR: "true", // General fallback for non-git commands
            VISUAL: "true", // Another common editor environment variable
          },
          stdio: [stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"], // stdin: pipe if provided, else ignore
        })
      );

      // Write stdin if provided
      if (stdin !== undefined && childProcess.child.stdin) {
        childProcess.child.stdin.write(stdin);
        childProcess.child.stdin.end();
      }

      // Use a promise to wait for completion
      return await new Promise<BashToolResult>((resolve) => {
        const lines: string[] = [];
        let truncated = false;
        let exitCode: number | null = null;
        let resolved = false;

        // Helper to resolve once
        const resolveOnce = (result: BashToolResult) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutHandle);
            // Clean up abort listener if present
            if (abortSignal && abortListener) {
              abortSignal.removeEventListener("abort", abortListener);
            }
            resolve(result);
          }
        };

        // Set up abort signal listener - kill process when stream is cancelled
        let abortListener: (() => void) | null = null;
        if (abortSignal) {
          abortListener = () => {
            if (!resolved) {
              childProcess.child.kill();
              // The close event will fire and handle finalization with abort error
            }
          };
          abortSignal.addEventListener("abort", abortListener);
        }

        // Set up timeout - kill process and let close event handle cleanup
        const timeoutHandle = setTimeout(() => {
          if (!resolved) {
            childProcess.child.kill();
            // The close event will fire and handle finalization with timeout error
          }
        }, timeout_secs * 1000);

        // Set up readline for both stdout and stderr to handle line buffering
        const stdoutReader = createInterface({ input: childProcess.child.stdout! });
        const stderrReader = createInterface({ input: childProcess.child.stderr! });

        stdoutReader.on("line", (line) => {
          if (!truncated && !resolved) {
            lines.push(line);
            // Check if we've exceeded max_lines
            if (lines.length >= max_lines) {
              truncated = true;
              // Close readline interfaces before killing to ensure clean shutdown
              stdoutReader.close();
              stderrReader.close();
              childProcess.child.kill();
            }
          }
        });

        stderrReader.on("line", (line) => {
          if (!truncated && !resolved) {
            lines.push(line);
            // Check if we've exceeded max_lines
            if (lines.length >= max_lines) {
              truncated = true;
              // Close readline interfaces before killing to ensure clean shutdown
              stdoutReader.close();
              stderrReader.close();
              childProcess.child.kill();
            }
          }
        });

        // Track when streams end
        stdoutReader.on("close", () => {
          stdoutEnded = true;
          tryFinalize();
        });

        stderrReader.on("close", () => {
          stderrEnded = true;
          tryFinalize();
        });

        // Use 'exit' event instead of 'close' to handle background processes correctly.
        // The 'close' event waits for ALL child processes (including background ones) to exit,
        // which causes hangs when users spawn background processes like servers.
        // The 'exit' event fires when the main bash process exits, which is what we want.
        let stdoutEnded = false;
        let stderrEnded = false;
        let processExited = false;

        const handleExit = (code: number | null) => {
          processExited = true;
          exitCode = code;
          // Try to finalize immediately if streams have ended
          tryFinalize();
          // Set a grace period timer - if streams don't end within 50ms, finalize anyway
          // This handles background processes that keep stdio open
          setTimeout(() => {
            if (!resolved && processExited) {
              // Forcibly destroy streams to ensure they close
              childProcess.child.stdout?.destroy();
              childProcess.child.stderr?.destroy();
              stdoutEnded = true;
              stderrEnded = true;
              finalize();
            }
          }, 50);
        };

        const tryFinalize = () => {
          if (resolved) return;
          // Finalize if process exited AND (both streams ended OR 100ms grace period passed)
          if (!processExited) return;

          // If we've already collected output, finalize immediately
          // Otherwise wait a bit for streams to flush
          if (stdoutEnded && stderrEnded) {
            finalize();
          }
        };

        const finalize = () => {
          if (resolved) return;

          // Round to integer to preserve tokens.
          const wall_duration_ms = Math.round(performance.now() - startTime);

          // Clean up readline interfaces if still open
          stdoutReader.close();
          stderrReader.close();

          // Join lines and add truncation marker if needed
          let output = lines.join("\n");
          if (truncated && output.length > 0) {
            output += " [TRUNCATED]";
          }

          // Check if this was aborted (stream cancelled)
          const wasAborted = abortSignal?.aborted ?? false;
          // Check if this was a timeout (process killed and no natural exit code)
          const timedOut = !wasAborted && wall_duration_ms >= timeout_secs * 1000 - 10; // 10ms tolerance

          if (wasAborted) {
            resolveOnce({
              success: false,
              error: "Command aborted due to stream cancellation",
              exitCode: -2,
              wall_duration_ms,
              truncated,
            });
          } else if (timedOut) {
            resolveOnce({
              success: false,
              error: `Command timed out after ${timeout_secs} seconds`,
              exitCode: -1,
              wall_duration_ms,
              truncated,
            });
          } else if (exitCode === 0 || exitCode === null) {
            resolveOnce({
              success: true,
              output,
              exitCode: 0,
              wall_duration_ms,
              ...(truncated && { truncated: true }),
            });
          } else {
            resolveOnce({
              success: false,
              output,
              exitCode,
              error: `Command exited with code ${exitCode}`,
              wall_duration_ms,
              truncated,
            });
          }
        };

        // Listen to exit event (fires when bash exits, before streams close)
        childProcess.child.on("exit", handleExit);

        childProcess.child.on("error", (err: Error) => {
          if (resolved) return;
          const wall_duration_ms = performance.now() - startTime;
          resolveOnce({
            success: false,
            error: `Failed to execute command: ${err.message}`,
            exitCode: -1,
            wall_duration_ms,
          });
        });
      });
    },
  });
};

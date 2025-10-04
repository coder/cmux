import { tool } from "ai";
import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { BashToolResult } from "../../types/tools";
import type { ToolConfiguration, ToolFactory } from "../../utils/tools";
import { TOOL_DEFINITIONS } from "../../utils/toolDefinitions";

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
    description: TOOL_DEFINITIONS.bash.description,
    inputSchema: TOOL_DEFINITIONS.bash.schema,
    execute: async ({ script, timeout_secs, max_lines }): Promise<BashToolResult> => {
      const startTime = performance.now();

      // Create the process with `using` for automatic cleanup
      using childProcess = new DisposableProcess(
        spawn("bash", ["-c", script], {
          cwd: config.cwd,
          env: process.env,
        })
      );

      // Use a promise to wait for completion
      return await new Promise<BashToolResult>((resolve) => {
        const lines: string[] = [];
        let truncated = false;
        let exitCode: number | null = null;
        let timedOut = false;
        let resolved = false;

        // Helper to resolve once
        const resolveOnce = (result: BashToolResult) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutHandle);
            resolve(result);
          }
        };

        // Set up timeout
        const timeoutHandle = setTimeout(() => {
          timedOut = true;
          const wall_duration_ms = performance.now() - startTime;
          resolveOnce({
            success: false,
            error: `Command timed out after ${timeout_secs} seconds`,
            exitCode: -1,
            wall_duration_ms,
            truncated,
          });
        }, timeout_secs * 1000);

        // Helper to check if we've exceeded max_lines
        const checkMaxLines = () => {
          if (lines.length >= max_lines) {
            truncated = true;
            stdoutReader.close();
            stderrReader.close();
            // Kill the process to stop generating more output
            childProcess.child.kill();
            return true;
          }
          return false;
        };

        // Set up readline for both stdout and stderr to handle line buffering
        const stdoutReader = createInterface({ input: childProcess.child.stdout! });
        const stderrReader = createInterface({ input: childProcess.child.stderr! });

        stdoutReader.on("line", (line) => {
          if (!truncated && !resolved) {
            lines.push(line);
            checkMaxLines();
          }
        });

        stderrReader.on("line", (line) => {
          if (!truncated && !resolved) {
            lines.push(line);
            checkMaxLines();
          }
        });

        childProcess.child.on("exit", (code: number | null) => {
          exitCode = code;
        });

        // Handle process completion
        const finalize = () => {
          if (resolved) return;

          const wall_duration_ms = performance.now() - startTime;

          // Join lines and add truncation marker if needed
          let output = lines.join("\n");
          if (truncated && output.length > 0) {
            output += " [TRUNCATED]";
          }

          if (timedOut) {
            resolveOnce({
              success: false,
              error: `Command timed out after ${timeout_secs} seconds`,
              exitCode: -1,
              wall_duration_ms,
              truncated,
            });
            return;
          }

          if (exitCode === 0 || exitCode === null) {
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

        // Wait for both readers to close and process to exit
        let stdoutClosed = false;
        let stderrClosed = false;
        let processExited = false;

        const checkComplete = () => {
          if (stdoutClosed && stderrClosed && processExited) {
            finalize();
          } else if (truncated && stdoutClosed && stderrClosed) {
            // If truncated, we can finalize as soon as readers are closed
            finalize();
          }
        };

        stdoutReader.on("close", () => {
          stdoutClosed = true;
          checkComplete();
        });

        stderrReader.on("close", () => {
          stderrClosed = true;
          checkComplete();
        });

        childProcess.child.on("exit", () => {
          processExited = true;
          // Give readers a moment to finish
          setTimeout(checkComplete, 50);
        });

        childProcess.child.on("error", (err: Error) => {
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

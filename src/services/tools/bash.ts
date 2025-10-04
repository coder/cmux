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
    description: TOOL_DEFINITIONS.bash.description + "\nRuns in " + config.cwd + " - no cd needed",
    inputSchema: TOOL_DEFINITIONS.bash.schema,
    execute: async ({ script, timeout_secs, max_lines }): Promise<BashToolResult> => {
      const startTime = performance.now();

      // Create the process with `using` for automatic cleanup
      using childProcess = new DisposableProcess(
        spawn("bash", ["-c", script], {
          cwd: config.cwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"], // stdin: ignore, stdout: pipe, stderr: pipe
        })
      );

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
            resolve(result);
          }
        };

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

        // The 'close' event fires when process exits AND all stdio streams are closed
        // This is our single source of truth - no coordination needed
        // Previous approaches tried coordinating exit/end events from multiple streams,
        // which caused hangs in Electron when stream 'end' events didn't fire reliably
        childProcess.child.on("close", (code: number | null) => {
          if (resolved) return;

          // Round to integer to preserve tokens.
          const wall_duration_ms = Math.round(performance.now() - startTime);
          exitCode = code;

          // Clean up readline interfaces if still open
          stdoutReader.close();
          stderrReader.close();

          // Join lines and add truncation marker if needed
          let output = lines.join("\n");
          if (truncated && output.length > 0) {
            output += " [TRUNCATED]";
          }

          // Check if this was a timeout (process killed and no natural exit code)
          const timedOut = wall_duration_ms >= timeout_secs * 1000 - 10; // 10ms tolerance

          if (timedOut) {
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
        });

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

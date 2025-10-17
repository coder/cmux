import { tool } from "ai";
import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { createInterface } from "readline";
import * as path from "path";
import * as fs from "fs";
import {
  BASH_DEFAULT_TIMEOUT_SECS,
  BASH_HARD_MAX_LINES,
  BASH_MAX_LINE_BYTES,
  BASH_MAX_TOTAL_BYTES,
  BASH_MAX_FILE_BYTES,
} from "@/constants/toolLimits";

import type { BashToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";

/**
 * Wraps a ChildProcess to make it disposable for use with `using` statements.
 * Always kills the entire process group with SIGKILL to prevent zombie processes.
 * SIGKILL cannot be caught or ignored, guaranteeing immediate cleanup.
 */
class DisposableProcess implements Disposable {
  private disposed = false;

  constructor(private readonly process: ChildProcess) {}

  [Symbol.dispose](): void {
    // Prevent double-signalling if dispose is called multiple times
    // (e.g., manually via abort/timeout, then automatically via `using`)
    if (this.disposed || this.process.pid === undefined) {
      return;
    }

    this.disposed = true;

    try {
      // Kill entire process group with SIGKILL - cannot be caught/ignored
      process.kill(-this.process.pid, "SIGKILL");
    } catch {
      // Fallback: try killing just the main process
      try {
        this.process.kill("SIGKILL");
      } catch {
        // Process already dead - ignore
      }
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
    execute: async ({ script, timeout_secs }, { abortSignal }): Promise<BashToolResult> => {
      // Validate script is not empty - likely indicates a malformed tool call
      // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
      if (!script || script.trim().length === 0) {
        return {
          success: false,
          error: "Script parameter is empty. This likely indicates a malformed tool call.",
          exitCode: -1,
          wall_duration_ms: 0,
        };
      }

      // Block sleep at the beginning of commands - they waste time waiting. Use polling loops instead.
      if (/^\s*sleep\s/.test(script)) {
        return {
          success: false,
          error:
            "sleep commands are blocked to minimize waiting time. Instead, use polling loops to check conditions repeatedly (e.g., 'while ! condition; do sleep 1; done' or 'until condition; do sleep 1; done').",
          exitCode: -1,
          wall_duration_ms: 0,
        };
      }

      // Default timeout to 3 seconds for interactivity
      // OpenAI models often don't provide timeout_secs even when marked required,
      // so we make it optional with a sensible default.
      const effectiveTimeout = timeout_secs ?? BASH_DEFAULT_TIMEOUT_SECS;

      const startTime = performance.now();
      const effectiveMaxLines = BASH_HARD_MAX_LINES;
      let totalBytesAccumulated = 0;
      let overflowReason: string | null = null;

      // Two-stage truncation to prevent re-running expensive commands:
      // 1. Display truncation (16KB): Stop showing output to agent, but keep collecting
      // 2. File truncation (100KB): Stop collecting entirely and kill the process
      // This allows agents to access full output via temp file without re-running
      let displayTruncated = false; // Hit 16KB display limit
      let fileTruncated = false; // Hit 100KB file limit

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
      // If niceness is specified, spawn nice directly to avoid escaping issues
      const spawnCommand = config.niceness !== undefined ? "nice" : "bash";
      const spawnArgs =
        config.niceness !== undefined
          ? ["-n", config.niceness.toString(), "bash", "-c", script]
          : ["-c", script];

      using childProcess = new DisposableProcess(
        spawn(spawnCommand, spawnArgs, {
          cwd: config.cwd,
          env: {
            ...process.env,
            // Inject secrets as environment variables
            ...(config.secrets ?? {}),
            // Prevent interactive editors from blocking bash execution
            // This is critical for git operations like rebase/commit that try to open editors
            GIT_EDITOR: "true", // Git-specific editor (highest priority)
            GIT_SEQUENCE_EDITOR: "true", // For interactive rebase sequences
            EDITOR: "true", // General fallback for non-git commands
            VISUAL: "true", // Another common editor environment variable
            // Prevent git from prompting for credentials
            // This is critical for operations like fetch/pull that might try to authenticate
            // Without this, git can hang waiting for user input if credentials aren't configured
            GIT_TERMINAL_PROMPT: "0", // Disables git credential prompts
          },
          stdio: ["ignore", "pipe", "pipe"],
          // CRITICAL: Spawn as detached process group leader to prevent zombie processes.
          // When a bash script spawns background processes (e.g., `sleep 100 &`), those
          // children would normally be reparented to init when bash exits, becoming orphans.
          // With detached:true, bash becomes a process group leader, allowing us to kill
          // the entire group (including all backgrounded children) via process.kill(-pid).
          detached: true,
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
              childProcess[Symbol.dispose]();
              // The close event will fire and handle finalization with abort error
            }
          };
          abortSignal.addEventListener("abort", abortListener);
        }

        // Set up timeout - kill process and let close event handle cleanup
        const timeoutHandle = setTimeout(() => {
          if (!resolved) {
            childProcess[Symbol.dispose]();
            // The close event will fire and handle finalization with timeout error
          }
        }, effectiveTimeout * 1000);

        // Set up readline for both stdout and stderr to handle line buffering
        const stdoutReader = createInterface({ input: childProcess.child.stdout! });
        const stderrReader = createInterface({ input: childProcess.child.stderr! });

        // Helper to trigger display truncation (stop showing to agent, keep collecting)
        const triggerDisplayTruncation = (reason: string) => {
          displayTruncated = true;
          truncated = true;
          overflowReason = reason;
          // Don't kill process yet - keep collecting up to file limit
        };

        // Helper to trigger file truncation (stop collecting, kill process)
        const triggerFileTruncation = (reason: string) => {
          fileTruncated = true;
          displayTruncated = true;
          truncated = true;
          overflowReason = reason;
          stdoutReader.close();
          stderrReader.close();
          childProcess[Symbol.dispose]();
        };

        stdoutReader.on("line", (line) => {
          if (!resolved && !fileTruncated) {
            const lineBytes = Buffer.byteLength(line, "utf-8");

            // Check if line exceeds per-line limit (hard stop - this is likely corrupt data)
            if (lineBytes > BASH_MAX_LINE_BYTES) {
              triggerFileTruncation(
                `Line ${lines.length + 1} exceeded per-line limit: ${lineBytes} bytes > ${BASH_MAX_LINE_BYTES} bytes`
              );
              return;
            }

            // Collect this line (even if display is truncated, keep for file)
            lines.push(line);
            totalBytesAccumulated += lineBytes + 1; // +1 for newline

            // Check file limit first (hard stop)
            if (totalBytesAccumulated > BASH_MAX_FILE_BYTES) {
              triggerFileTruncation(
                `Total output exceeded file preservation limit: ${totalBytesAccumulated} bytes > ${BASH_MAX_FILE_BYTES} bytes (at line ${lines.length})`
              );
              return;
            }

            // Check display limits (soft stop - keep collecting for file)
            if (!displayTruncated) {
              if (totalBytesAccumulated > BASH_MAX_TOTAL_BYTES) {
                triggerDisplayTruncation(
                  `Total output exceeded display limit: ${totalBytesAccumulated} bytes > ${BASH_MAX_TOTAL_BYTES} bytes (at line ${lines.length})`
                );
                return;
              }

              if (lines.length >= effectiveMaxLines) {
                triggerDisplayTruncation(
                  `Line count exceeded display limit: ${lines.length} lines >= ${effectiveMaxLines} lines (${totalBytesAccumulated} bytes read)`
                );
              }
            }
          }
        });

        stderrReader.on("line", (line) => {
          if (!resolved && !fileTruncated) {
            const lineBytes = Buffer.byteLength(line, "utf-8");

            // Check if line exceeds per-line limit (hard stop - this is likely corrupt data)
            if (lineBytes > BASH_MAX_LINE_BYTES) {
              triggerFileTruncation(
                `Line ${lines.length + 1} exceeded per-line limit: ${lineBytes} bytes > ${BASH_MAX_LINE_BYTES} bytes`
              );
              return;
            }

            // Collect this line (even if display is truncated, keep for file)
            lines.push(line);
            totalBytesAccumulated += lineBytes + 1; // +1 for newline

            // Check file limit first (hard stop)
            if (totalBytesAccumulated > BASH_MAX_FILE_BYTES) {
              triggerFileTruncation(
                `Total output exceeded file preservation limit: ${totalBytesAccumulated} bytes > ${BASH_MAX_FILE_BYTES} bytes (at line ${lines.length})`
              );
              return;
            }

            // Check display limits (soft stop - keep collecting for file)
            if (!displayTruncated) {
              if (totalBytesAccumulated > BASH_MAX_TOTAL_BYTES) {
                triggerDisplayTruncation(
                  `Total output exceeded display limit: ${totalBytesAccumulated} bytes > ${BASH_MAX_TOTAL_BYTES} bytes (at line ${lines.length})`
                );
                return;
              }

              if (lines.length >= effectiveMaxLines) {
                triggerDisplayTruncation(
                  `Line count exceeded display limit: ${lines.length} lines >= ${effectiveMaxLines} lines (${totalBytesAccumulated} bytes read)`
                );
              }
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

          // Check if this was aborted (stream cancelled)
          const wasAborted = abortSignal?.aborted ?? false;
          // Check if this was a timeout (process killed and no natural exit code)
          const timedOut = !wasAborted && wall_duration_ms >= effectiveTimeout * 1000 - 10; // 10ms tolerance

          if (wasAborted) {
            resolveOnce({
              success: false,
              error: "Command aborted due to stream cancellation",
              exitCode: -2,
              wall_duration_ms,
            });
          } else if (timedOut) {
            resolveOnce({
              success: false,
              error: `Command timed out after ${effectiveTimeout} seconds`,
              exitCode: -1,
              wall_duration_ms,
            });
          } else if (truncated) {
            // Handle overflow based on policy
            const overflowPolicy = config.overflow_policy ?? "tmpfile";

            if (overflowPolicy === "truncate") {
              // Return truncated output with first 80 lines
              const maxTruncateLines = 80;
              const truncatedLines = lines.slice(0, maxTruncateLines);
              const truncatedOutput = truncatedLines.join("\n");
              const errorMessage = `[OUTPUT TRUNCATED - ${overflowReason ?? "unknown reason"}]\n\nShowing first ${maxTruncateLines} of ${lines.length} lines:\n\n${truncatedOutput}`;

              resolveOnce({
                success: false,
                error: errorMessage,
                exitCode: -1,
                wall_duration_ms,
              });
            } else {
              // tmpfile policy: Save overflow output to temp file instead of returning an error
              // We don't show ANY of the actual output to avoid overwhelming context.
              // Instead, save it to a temp file and encourage the agent to use filtering tools.
              try {
                // Use 8 hex characters for short, memorable temp file IDs
                const fileId = Math.random().toString(16).substring(2, 10);
                const overflowPath = path.join(config.tempDir, `bash-${fileId}.txt`);
                const fullOutput = lines.join("\n");
                fs.writeFileSync(overflowPath, fullOutput, "utf-8");

                const output = `[OUTPUT OVERFLOW - ${overflowReason ?? "unknown reason"}]

Full output (${lines.length} lines) saved to ${overflowPath}

Use selective filtering tools (e.g. grep) to extract relevant information and continue your task

File will be automatically cleaned up when stream ends.`;

                resolveOnce({
                  success: false,
                  error: output,
                  exitCode: -1,
                  wall_duration_ms,
                });
              } catch (err) {
                // If temp file creation fails, fall back to original error
                resolveOnce({
                  success: false,
                  error: `Command output overflow: ${overflowReason ?? "unknown reason"}. Failed to save overflow to temp file: ${String(err)}`,
                  exitCode: -1,
                  wall_duration_ms,
                });
              }
            }
          } else if (exitCode === 0 || exitCode === null) {
            resolveOnce({
              success: true,
              output: lines.join("\n"),
              exitCode: 0,
              wall_duration_ms,
            });
          } else {
            resolveOnce({
              success: false,
              output: lines.join("\n"),
              exitCode,
              error: `Command exited with code ${exitCode}`,
              wall_duration_ms,
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

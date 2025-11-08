import { tool } from "ai";
import { createInterface } from "readline";
import * as path from "path";
import { Readable } from "stream";
import {
  BASH_DEFAULT_TIMEOUT_SECS,
  BASH_HARD_MAX_LINES,
  BASH_MAX_LINE_BYTES,
  BASH_MAX_TOTAL_BYTES,
  BASH_MAX_FILE_BYTES,
  BASH_TRUNCATE_MAX_TOTAL_BYTES,
  BASH_TRUNCATE_MAX_FILE_BYTES,
} from "@/constants/toolLimits";
import { EXIT_CODE_ABORTED, EXIT_CODE_TIMEOUT } from "@/constants/exitCodes";

import type { BashToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";

/**
 * Validates bash script input for common issues
 * Returns error result if validation fails, null if valid
 */
function validateScript(script: string, config: ToolConfiguration): BashToolResult | null {
  // Check for empty script
  if (!script || script.trim().length === 0) {
    return {
      success: false,
      error: "Script parameter is empty. This likely indicates a malformed tool call.",
      exitCode: -1,
      wall_duration_ms: 0,
    };
  }

  // Block sleep at the beginning of commands - they waste time waiting
  if (/^\s*sleep\s/.test(script)) {
    return {
      success: false,
      error:
        "do not start commands with sleep; prefer <10s sleeps in busy loops (e.g., 'while ! condition; do sleep 1; done' or 'until condition; do sleep 1; done').",
      exitCode: -1,
      wall_duration_ms: 0,
    };
  }

  // Detect redundant cd to working directory
  const cdPattern = /^\s*cd\s+['"]?([^'";&|]+)['"]?\s*[;&|]/;
  const match = cdPattern.exec(script);
  if (match) {
    const targetPath = match[1].trim();
    const normalizedTarget = config.runtime.normalizePath(targetPath, config.cwd);
    const normalizedCwd = config.runtime.normalizePath(".", config.cwd);

    if (normalizedTarget === normalizedCwd) {
      return {
        success: false,
        error: `Redundant cd to working directory detected. The tool already runs in ${config.cwd} - no cd needed. Remove the 'cd ${targetPath}' prefix.`,
        exitCode: -1,
        wall_duration_ms: 0,
      };
    }
  }

  return null; // Valid
}

/**
 * Creates a line handler that enforces truncation limits
 * Processes lines for both stdout and stderr with identical logic
 */
function createLineHandler(
  lines: string[],
  totalBytesRef: { current: number },
  limits: {
    maxLineBytes: number;
    maxFileBytes: number;
    maxTotalBytes: number;
    maxLines: number;
  },
  state: {
    displayTruncated: boolean;
    fileTruncated: boolean;
  },
  triggerDisplayTruncation: (reason: string) => void,
  triggerFileTruncation: (reason: string) => void
): (line: string) => void {
  return (line: string) => {
    if (state.fileTruncated) return;

    const lineBytes = Buffer.byteLength(line, "utf-8");

    // Check if line exceeds per-line limit (hard stop - likely corrupt data)
    if (lineBytes > limits.maxLineBytes) {
      triggerFileTruncation(
        `Line ${lines.length + 1} exceeded per-line limit: ${lineBytes} bytes > ${limits.maxLineBytes} bytes`
      );
      return;
    }

    // Check file limit BEFORE adding line
    const bytesAfterLine = totalBytesRef.current + lineBytes + 1; // +1 for newline
    if (bytesAfterLine > limits.maxFileBytes) {
      triggerFileTruncation(
        `Total output would exceed file preservation limit: ${bytesAfterLine} bytes > ${limits.maxFileBytes} bytes (at line ${lines.length + 1})`
      );
      return;
    }

    // Collect line (even if display is truncated, keep for file)
    lines.push(line);
    totalBytesRef.current = bytesAfterLine;

    // Check display limits (soft stop - keep collecting for file)
    if (!state.displayTruncated) {
      if (totalBytesRef.current > limits.maxTotalBytes) {
        triggerDisplayTruncation(
          `Total output exceeded display limit: ${totalBytesRef.current} bytes > ${limits.maxTotalBytes} bytes (at line ${lines.length})`
        );
        return;
      }

      if (lines.length >= limits.maxLines) {
        triggerDisplayTruncation(
          `Line count exceeded display limit: ${lines.length} lines >= ${limits.maxLines} lines (${totalBytesRef.current} bytes read)`
        );
      }
    }
  };
}

/**
 * Formats the final bash tool result based on exit code and truncation state
 */
function formatResult(
  exitCode: number,
  lines: string[],
  truncated: boolean,
  overflowReason: string | null,
  wall_duration_ms: number,
  overflowPolicy: "tmpfile" | "truncate"
): BashToolResult {
  const output = lines.join("\n");

  // Check for special error codes from runtime
  if (exitCode === EXIT_CODE_ABORTED) {
    return {
      success: false,
      error: "Command execution was aborted",
      exitCode: -1,
      wall_duration_ms,
    };
  }

  if (exitCode === EXIT_CODE_TIMEOUT) {
    return {
      success: false,
      error: "Command exceeded timeout",
      exitCode: -1,
      wall_duration_ms,
    };
  }

  // Handle truncation
  if (truncated) {
    const truncationInfo = {
      reason: overflowReason ?? "unknown reason",
      totalLines: lines.length,
    };

    if (overflowPolicy === "truncate") {
      // Return all collected lines with truncation marker
      if (exitCode === 0) {
        return {
          success: true,
          output,
          exitCode: 0,
          wall_duration_ms,
          truncated: truncationInfo,
        };
      } else {
        return {
          success: false,
          output,
          exitCode,
          error: `Command exited with code ${exitCode}`,
          wall_duration_ms,
          truncated: truncationInfo,
        };
      }
    }
  }

  // Normal exit
  if (exitCode === 0) {
    return {
      success: true,
      output,
      exitCode: 0,
      wall_duration_ms,
    };
  } else {
    return {
      success: false,
      output,
      exitCode,
      error: `Command exited with code ${exitCode}`,
      wall_duration_ms,
    };
  }
}

/**
 * Bash execution tool factory for AI assistant
 * Creates a bash tool that can execute commands with a configurable timeout
 * @param config Required configuration including working directory
 */
export const createBashTool: ToolFactory = (config: ToolConfiguration) => {
  // Select limits based on overflow policy
  // truncate = IPC calls (generous limits for UI features, no line limit, no per-line limit)
  // tmpfile = AI agent calls (conservative limits for LLM context)
  const overflowPolicy = config.overflow_policy ?? "tmpfile";
  const maxTotalBytes =
    overflowPolicy === "truncate" ? BASH_TRUNCATE_MAX_TOTAL_BYTES : BASH_MAX_TOTAL_BYTES;
  const maxFileBytes =
    overflowPolicy === "truncate" ? BASH_TRUNCATE_MAX_FILE_BYTES : BASH_MAX_FILE_BYTES;
  const maxLines = overflowPolicy === "truncate" ? Infinity : BASH_HARD_MAX_LINES;
  const maxLineBytes = overflowPolicy === "truncate" ? Infinity : BASH_MAX_LINE_BYTES;

  return tool({
    description: TOOL_DEFINITIONS.bash.description + "\nRuns in " + config.cwd + " - no cd needed",
    inputSchema: TOOL_DEFINITIONS.bash.schema,
    execute: async ({ script, timeout_secs }, { abortSignal }): Promise<BashToolResult> => {
      // Validate script input
      const validationError = validateScript(script, config);
      if (validationError) return validationError;

      // Setup execution parameters
      const effectiveTimeout = timeout_secs ?? BASH_DEFAULT_TIMEOUT_SECS;
      const startTime = performance.now();
      const totalBytesRef = { current: 0 }; // Use ref for shared access in line handler
      let overflowReason: string | null = null;
      const truncationState = { displayTruncated: false, fileTruncated: false };

      // Execute using runtime interface (works for both local and SSH)
      const execStream = await config.runtime.exec(script, {
        cwd: config.cwd,
        env: config.secrets,
        timeout: effectiveTimeout,
        niceness: config.niceness,
        abortSignal,
      });

      // Force-close stdin immediately - we don't need to send any input
      // Use abort() instead of close() for immediate, synchronous closure
      // close() is async and waits for acknowledgment, which can hang over SSH
      // abort() immediately marks stream as errored and releases locks
      execStream.stdin.abort().catch(() => {
        // Ignore errors - stream might already be closed
      });

      // Convert Web Streams to Node.js streams for readline
      // Type mismatch between Node.js ReadableStream and Web ReadableStream - safe to cast
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const stdoutNodeStream = Readable.fromWeb(execStream.stdout as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const stderrNodeStream = Readable.fromWeb(execStream.stderr as any);

      // Set up readline for both stdout and stderr to handle buffering
      const stdoutReader = createInterface({ input: stdoutNodeStream });
      const stderrReader = createInterface({ input: stderrNodeStream });

      // Collect output
      const lines: string[] = [];
      let truncated = false;

      // Helper to trigger display truncation (stop showing to agent, keep collecting)
      const triggerDisplayTruncation = (reason: string) => {
        truncationState.displayTruncated = true;
        truncated = true;
        overflowReason = reason;
        // Don't kill process yet - keep collecting up to file limit
      };

      // Helper to trigger file truncation (stop collecting, close streams)
      const triggerFileTruncation = (reason: string) => {
        truncationState.fileTruncated = true;
        truncationState.displayTruncated = true;
        truncated = true;
        overflowReason = reason;
        stdoutReader.close();
        stderrReader.close();
        // Cancel the streams to stop the process
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        execStream.stdout.cancel().catch(() => {});
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        execStream.stderr.cancel().catch(() => {});
      };

      // Create unified line handler for both stdout and stderr
      const lineHandler = createLineHandler(
        lines,
        totalBytesRef,
        { maxLineBytes, maxFileBytes, maxTotalBytes, maxLines },
        truncationState,
        triggerDisplayTruncation,
        triggerFileTruncation
      );

      stdoutReader.on("line", lineHandler);
      stderrReader.on("line", lineHandler);

      // Wait for process to exit
      let exitCode: number;
      try {
        exitCode = await execStream.exitCode;
      } catch (err: unknown) {
        // Cleanup immediately
        stdoutReader.close();
        stderrReader.close();
        stdoutNodeStream.destroy();
        stderrNodeStream.destroy();

        return {
          success: false,
          error: `Failed to execute command: ${err instanceof Error ? err.message : String(err)}`,
          exitCode: -1,
          wall_duration_ms: Math.round(performance.now() - startTime),
        };
      }

      // Give readline interfaces a moment to process final buffered data
      // Process has exited but readline may still be processing buffered chunks
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Now cleanup
      stdoutReader.close();
      stderrReader.close();
      stdoutNodeStream.destroy();
      stderrNodeStream.destroy();

      // Round to integer to preserve tokens
      const wall_duration_ms = Math.round(performance.now() - startTime);

      // Handle tmpfile overflow policy separately (writes to file)
      if (truncated && (config.overflow_policy ?? "tmpfile") === "tmpfile") {
        // tmpfile policy: Save overflow output to temp file instead of returning an error
        // We don't show ANY of the actual output to avoid overwhelming context.
        // Instead, save it to a temp file and encourage the agent to use filtering tools.
        try {
          // Use 8 hex characters for short, memorable temp file IDs
          const fileId = Math.random().toString(16).substring(2, 10);
          // Write to runtime temp directory (managed by StreamManager)
          // Use path.posix.join to preserve forward slashes for SSH runtime
          // (config.runtimeTempDir is always a POSIX path like /home/user/.cmux-tmp/token)
          const overflowPath = path.posix.join(config.runtimeTempDir, `bash-${fileId}.txt`);
          const fullOutput = lines.join("\n");

          // Use runtime.writeFile() for SSH support
          const writer = config.runtime.writeFile(overflowPath, abortSignal);
          const encoder = new TextEncoder();
          const writerInstance = writer.getWriter();
          await writerInstance.write(encoder.encode(fullOutput));
          await writerInstance.close();

          const output = `[OUTPUT OVERFLOW - ${overflowReason ?? "unknown reason"}]

Full output (${lines.length} lines) saved to ${overflowPath}

Use selective filtering tools (e.g. grep) to extract relevant information and continue your task

File will be automatically cleaned up when stream ends.`;

          return {
            success: false,
            error: output,
            exitCode: -1,
            wall_duration_ms,
          };
        } catch (err) {
          // If temp file creation fails, fall back to original error
          return {
            success: false,
            error: `Command output overflow: ${overflowReason ?? "unknown reason"}. Failed to save overflow to temp file: ${String(err)}`,
            exitCode: -1,
            wall_duration_ms,
          };
        }
      }

      // Format result based on exit code and truncation state
      return formatResult(
        exitCode,
        lines,
        truncated,
        overflowReason,
        wall_duration_ms,
        config.overflow_policy ?? "tmpfile"
      );
    },
  });
};

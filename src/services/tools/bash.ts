import { tool } from "ai";
import { exec } from "child_process";
import { promisify } from "util";
import type { BashToolResult } from "../../types/tools";
import type { ToolConfiguration, ToolFactory } from "../../utils/tools";
import { TOOL_DEFINITIONS } from "../../utils/toolDefinitions";

const execAsync = promisify(exec);

/**
 * Bash execution tool factory for AI assistant
 * Creates a bash tool that can execute commands with a configurable timeout
 * @param config Required configuration including working directory
 */
export const createBashTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.bash.description,
    inputSchema: TOOL_DEFINITIONS.bash.schema,
    execute: async ({ script, timeout_secs }): Promise<BashToolResult> => {
      const startTime = performance.now();

      try {
        const timeoutMs = timeout_secs * 1000;

        // Execute command with timeout and required working directory
        const execOptions = {
          timeout: timeoutMs,
          // Use a relatively small 16kb buffer to avoid overwhelming context.
          maxBuffer: 1024 * 16,
          encoding: "utf8" as const,
          cwd: config.cwd,
        };

        const { stdout, stderr } = await execAsync(script, execOptions);
        const wall_duration_ms = performance.now() - startTime;

        return {
          success: true,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: 0,
          wall_duration_ms,
        };
      } catch (error) {
        const wall_duration_ms = performance.now() - startTime;

        // Handle timeout errors
        if (error && typeof error === "object" && "killed" in error && error.killed) {
          return {
            success: false,
            error: `Command timed out after ${timeout_secs} seconds`,
            exitCode: -1,
            wall_duration_ms,
          };
        }

        // Handle execution errors with exit codes
        if (error && typeof error === "object" && "code" in error) {
          const stdout =
            "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
          const stderr =
            "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
          const exitCode = typeof error.code === "number" ? error.code : -1;

          return {
            success: false,
            stdout,
            stderr,
            exitCode,
            error: `Command exited with code ${exitCode}`,
            wall_duration_ms,
          };
        }

        // Generic error
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to execute command: ${message}`,
          exitCode: -1,
          wall_duration_ms,
        };
      }
    },
  });
};

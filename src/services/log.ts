/**
 * Pipe-safe logging utilities for cmux
 *
 * These functions wrap console.log/error with EPIPE protection to prevent
 * crashes when stdout/stderr pipes are closed (e.g., when piping to head/tail).
 *
 * They also prefix log messages with the caller's file path and line number
 * for easier debugging.
 */

/**
 * Get the caller's file path and line number from the stack trace
 * Returns format: "path/to/file.ts:123"
 */
function getCallerLocation(): string {
  const error = new Error();
  const stack = error.stack?.split("\n");

  // Stack trace format:
  // 0: "Error"
  // 1: "    at getCallerLocation (log.ts:X:Y)"
  // 2: "    at safePipeLog (log.ts:X:Y)"
  // 3: "    at log.info (log.ts:X:Y)"  or  "at log.error (log.ts:X:Y)"
  // 4: "    at <actual caller> (file.ts:X:Y)" <- We want this one

  if (stack && stack.length > 4) {
    const callerLine = stack[4];
    // Extract file path and line number from the stack trace
    // Format: "    at FunctionName (path/to/file.ts:123:45)"
    const match = callerLine.match(/\((.+):(\d+):\d+\)/) || callerLine.match(/at (.+):(\d+):\d+/);

    if (match) {
      const [, filePath, lineNum] = match;
      // Strip the full path to just show relative path from project root
      const relativePath = filePath.replace(/^.*\/cmux\//, "");
      return `${relativePath}:${lineNum}`;
    }
  }

  return "unknown:0";
}

/**
 * Pipe-safe logging function with caller location prefix
 * @param level - "info", "error", or "debug"
 * @param args - Arguments to log
 */
function safePipeLog(level: "info" | "error" | "debug", ...args: unknown[]): void {
  const location = getCallerLocation();
  const prefix = `[${location}]`;

  try {
    if (level === "error") {
      console.error(prefix, ...args);
    } else if (level === "debug") {
      // Only log debug messages if CMUX_DEBUG is set
      if (process.env.CMUX_DEBUG) {
        console.log(prefix, ...args);
      }
    } else {
      console.log(prefix, ...args);
    }
  } catch (error) {
    // Silently ignore EPIPE and other console errors
    const errorCode =
      error && typeof error === "object" && "code" in error ? error.code : undefined;
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unknown error";

    if (errorCode !== "EPIPE") {
      try {
        const stream = level === "error" ? process.stderr : process.stdout;
        stream.write(`${prefix} Console error: ${errorMessage}\n`);
      } catch {
        // Even the fallback might fail, just ignore
      }
    }
  }
}

/**
 * Logging utilities with EPIPE protection and caller location prefixes
 */
export const log = {
  /**
   * Log an informational message to stdout
   * Prefixes output with caller's file path and line number
   */
  info: (...args: unknown[]): void => {
    safePipeLog("info", ...args);
  },

  /**
   * Log an error message to stderr
   * Prefixes output with caller's file path and line number
   */
  error: (...args: unknown[]): void => {
    safePipeLog("error", ...args);
  },

  /**
   * Log a debug message to stdout (only when CMUX_DEBUG is set)
   * Prefixes output with caller's file path and line number
   */
  debug: (...args: unknown[]): void => {
    safePipeLog("debug", ...args);
  },
};

/**
 * Pipe-safe logging utilities for cmux
 *
 * These functions wrap console.log/error with EPIPE protection to prevent
 * crashes when stdout/stderr pipes are closed (e.g., when piping to head/tail).
 *
 * They also prefix log messages with the caller's file path and line number
 * for easier debugging.
 */

import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { defaultConfig } from "@/config";

const DEBUG_OBJ_DIR = path.join(defaultConfig.rootDir, "debug_obj");

/**
 * Parse environment variable as boolean
 * Accepts: "1", "true", "TRUE", "yes", "YES" as true
 * Everything else (including undefined, "0", "false", "FALSE") as false
 */
function parseBoolEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/**
 * Check if debug mode is enabled
 */
function isDebugMode(): boolean {
  return parseBoolEnv(process.env.CMUX_DEBUG);
}

/**
 * Check if we're running in a TTY (terminal) that supports colors
 */
function supportsColor(): boolean {
  return process.stdout.isTTY ?? false;
}

/**
 * Get kitchen time timestamp for logs (12-hour format with milliseconds)
 * Format: 8:23.456PM (hours:minutes.milliseconds)
 */
function getTimestamp(): string {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const milliseconds = now.getMilliseconds();
  
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // Convert 0 to 12
  
  const mm = String(minutes).padStart(2, "0");
  const ms = String(milliseconds).padStart(3, "0"); // 3 digits: 000-999
  
  return `${hours}:${mm}.${ms}${ampm}`;
}

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
    const match = /\((.+):(\d+):\d+\)/.exec(callerLine) ?? /at (.+):(\d+):\d+/.exec(callerLine);

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
 * Pipe-safe logging function with styled timestamp and caller location
 * Format: 8:23.456PM src/main.ts:23 <message>
 * @param level - "info", "error", or "debug"
 * @param args - Arguments to log
 */
function safePipeLog(level: "info" | "error" | "debug", ...args: unknown[]): void {
  const timestamp = getTimestamp();
  const location = getCallerLocation();
  const useColor = supportsColor();
  
  // Apply colors based on level (if terminal supports it)
  let prefix: string;
  if (useColor) {
    const coloredTimestamp = chalk.dim(timestamp);
    const coloredLocation = chalk.cyan(location);
    
    if (level === "error") {
      prefix = `${coloredTimestamp} ${coloredLocation}`;
    } else if (level === "debug") {
      prefix = `${coloredTimestamp} ${chalk.gray(location)}`;
    } else {
      // info
      prefix = `${coloredTimestamp} ${coloredLocation}`;
    }
  } else {
    // No colors
    prefix = `${timestamp} ${location}`;
  }

  try {
    if (level === "error") {
      // Color the entire error message red if supported
      if (useColor) {
        console.error(prefix, ...args.map(arg => 
          typeof arg === "string" ? chalk.red(arg) : arg
        ));
      } else {
        console.error(prefix, ...args);
      }
    } else if (level === "debug") {
      // Only log debug messages if CMUX_DEBUG is set
      if (isDebugMode()) {
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
        stream.write(`${timestamp} ${location} Console error: ${errorMessage}\n`);
      } catch {
        // Even the fallback might fail, just ignore
      }
    }
  }
}

/**
 * Dump an object to a JSON file in the debug_obj directory (only in debug mode)
 * @param filename - Name of the file (can include subdirectories like "workspace_id/file.json")
 * @param obj - Object to serialize and dump
 */
function debugObject(filename: string, obj: unknown): void {
  if (!isDebugMode()) {
    return;
  }

  try {
    // Ensure debug_obj directory exists
    fs.mkdirSync(DEBUG_OBJ_DIR, { recursive: true });

    const filePath = path.join(DEBUG_OBJ_DIR, filename);
    const dirPath = path.dirname(filePath);

    // Ensure subdirectories exist
    fs.mkdirSync(dirPath, { recursive: true });

    // Write the object as pretty-printed JSON
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");

    // Log that we dumped the object
    safePipeLog("debug", `Dumped object to ${filePath}`);
  } catch (error) {
    // Don't crash if we can't write debug files
    safePipeLog("error", `Failed to dump debug object to ${filename}:`, error);
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

  /**
   * Dump an object to a JSON file for debugging (only when CMUX_DEBUG is set)
   * Files are written to ~/.cmux/debug_obj/
   *
   * @param filename - Name of the file (e.g., "model_messages.json" or "workspace/data.json")
   * @param obj - Object to serialize and dump
   *
   * @example
   * log.debug_obj("transformed_messages.json", messages);
   * log.debug_obj(`${workspaceId}/model_messages.json`, modelMessages);
   */
  debug_obj: debugObject,

  /**
   * Check if debug mode is enabled
   */
  isDebugMode,

  /**
   * Parse environment variable as boolean
   * Accepts: "1", "true", "TRUE", "yes", "YES" as true
   */
  parseBoolEnv,
};

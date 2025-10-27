/**
 * Utilities for finding executable paths
 *
 * In CI and some containerized environments, PATH may not be set correctly
 * for spawned child processes. This module provides reliable ways to find
 * common executables by checking standard locations.
 */

import { existsSync } from "fs";

/**
 * Find the bash executable path.
 * Checks common locations and falls back to "bash" if not found.
 *
 * @returns Full path to bash executable, or "bash" as fallback
 */
export function findBashPath(): string {
  // Common bash locations (ordered by preference)
  const commonPaths = [
    "/bin/bash", // Most Linux systems
    "/usr/bin/bash", // Some Unix systems
    "/usr/local/bin/bash", // Homebrew on macOS
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Fallback to "bash" and rely on PATH
  return "bash";
}

/**
 * Find the nice executable path.
 * Checks common locations and falls back to "nice" if not found.
 *
 * @returns Full path to nice executable, or "nice" as fallback
 */
export function findNicePath(): string {
  // Common nice locations (ordered by preference)
  const commonPaths = [
    "/usr/bin/nice", // Most Linux systems
    "/bin/nice", // Some Unix systems
    "/usr/local/bin/nice", // Homebrew on macOS
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Fallback to "nice" and rely on PATH
  return "nice";
}

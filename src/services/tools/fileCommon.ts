import * as path from "path";
import { createPatch } from "diff";
import type { FileStat, Runtime } from "@/runtime/Runtime";
import { SSHRuntime } from "@/runtime/SSHRuntime";

// WRITE_DENIED_PREFIX moved to @/types/tools for frontend/backend sharing

/**
 * Maximum file size for file operations (1MB)
 * Files larger than this should be processed with system tools like grep, sed, etc.
 */
export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * Compute a 6-character hexadecimal lease from file content.
 * The lease changes when file content is modified.
 * Uses a deterministic hash so leases are consistent across processes.
 */

/**
 * Generate a unified diff between old and new content using jsdiff.
 * Uses createPatch with context of 3 lines.
 *
 * @param filePath - The file path being edited (used in diff header)
 * @param oldContent - The original file content
 * @param newContent - The modified file content
 * @returns Unified diff string
 */
export function generateDiff(filePath: string, oldContent: string, newContent: string): string {
  return createPatch(filePath, oldContent, newContent, "", "", { context: 3 });
}

/**
 * Validates that a file size is within the allowed limit.
 * Returns an error object if the file is too large, null if valid.
 *
 * @param stats - File stats from fs.stat()
 * @returns Error object if file is too large, null if valid
 */
export function validateFileSize(stats: FileStat): { error: string } | null {
  if (stats.size > MAX_FILE_SIZE) {
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(2);
    return {
      error: `File is too large (${sizeMB}MB). The maximum file size for file operations is ${maxMB}MB. Please use system tools like grep, sed, awk, or split the file into smaller chunks.`,
    };
  }
  return null;
}

/**
 * Validates that a file path doesn't contain redundant workspace prefix.
 * Returns an error object if the path contains the cwd prefix, null if valid.
 * This helps save tokens by encouraging relative paths.
 *
 * Works for both local and SSH runtimes by using simple string matching
 * for absolute paths instead of Node's path module (which only handles local paths).
 *
 * @param filePath - The file path to validate
 * @param cwd - The working directory
 * @param runtime - The runtime (unused, kept for consistency)
 * @returns Error object if redundant prefix found, null if valid
 */
export function validateNoRedundantPrefix(
  filePath: string,
  cwd: string,
  runtime: Runtime
): { error: string } | null {
  // Only check absolute paths (start with /) - relative paths are fine
  // This works for both local and SSH since both use Unix-style paths
  if (!filePath.startsWith("/")) {
    return null;
  }

  // Normalize both paths: remove trailing slashes for consistent comparison
  const normalizedPath = filePath.replace(/\/+$/, "");
  const normalizedCwd = cwd.replace(/\/+$/, "");

  // Check if the absolute path starts with the cwd
  // Use startsWith + check for path separator to avoid partial matches
  // e.g., /workspace/project should match /workspace/project/src but not /workspace/project2
  if (
    normalizedPath === normalizedCwd ||
    normalizedPath.startsWith(normalizedCwd + "/")
  ) {
    // Calculate what the relative path would be
    const relativePath =
      normalizedPath === normalizedCwd ? "." : normalizedPath.substring(normalizedCwd.length + 1);
    return {
      error: `Redundant path prefix detected. The path '${filePath}' contains the workspace directory. Please use relative paths to save tokens: '${relativePath}'`,
    };
  }

  return null;
}

/**
 * Validates that a file path is within the allowed working directory.
 * Returns an error object if the path is outside cwd, null if valid.
 *
 * @param filePath - The file path to validate (can be relative or absolute)
 * @param cwd - The working directory that file operations are restricted to
 * @param runtime - The runtime (used to detect SSH - TODO: make path validation runtime-aware)
 * @returns Error object if invalid, null if valid
 */
export function validatePathInCwd(
  filePath: string,
  cwd: string,
  runtime: Runtime
): { error: string } | null {
  // TODO: Make path validation runtime-aware instead of skipping for SSH.
  // For now, skip local path validation for SSH runtimes since:
  // 1. Node's path module doesn't understand remote paths (~/cmux/branch)
  // 2. The runtime's own file operations will fail on invalid paths anyway
  if (runtime instanceof SSHRuntime) {
    return null;
  }

  // Resolve the path (handles relative paths and normalizes)
  const resolvedPath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(cwd, filePath);
  const resolvedCwd = path.resolve(cwd);

  // Check if resolved path starts with cwd (accounting for trailing slashes)
  // Use path.relative to check if we need to go "up" from cwd to reach the file
  const relativePath = path.relative(resolvedCwd, resolvedPath);

  // If the relative path starts with '..' or is empty, the file is outside cwd
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return {
      error: `File operations are restricted to the workspace directory (${cwd}). The path '${filePath}' resolves outside this directory. If you need to modify files outside the workspace, please ask the user for permission first.`,
    };
  }

  return null;
}

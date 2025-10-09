import * as crypto from "crypto";
import type * as fs from "fs";
import * as path from "path";
import { createPatch } from "diff";

/**
 * Maximum file size for file operations (1MB)
 * Files larger than this should be processed with system tools like grep, sed, etc.
 */
export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * Compute a 6-character hexadecimal lease from file content.
 * The lease changes when file content is modified.
 * Uses a deterministic hash so leases are consistent across processes.
 *
 * @param content - File content as string or Buffer
 * @returns 6-character hexadecimal lease string
 */
export function leaseFromContent(content: string | Buffer): string {
  // Use deterministic SHA-256 hash of content so leases are consistent
  // across processes and restarts
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 6);
}


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
export function validateFileSize(stats: fs.Stats): { error: string } | null {
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
 * Validates that a file path is within the allowed working directory.
 * Returns an error object if the path is outside cwd, null if valid.
 *
 * @param filePath - The file path to validate (can be relative or absolute)
 * @param cwd - The working directory that file operations are restricted to
 * @returns Error object if invalid, null if valid
 */
export function validatePathInCwd(filePath: string, cwd: string): { error: string } | null {
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

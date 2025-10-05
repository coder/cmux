import * as crypto from "crypto";
import type * as fs from "fs";
import { createPatch } from "diff";

/**
 * Compute a 6-character hexadecimal lease from file stats.
 * The lease changes when file is modified (mtime or size changes).
 * Uses a deterministic hash so leases are consistent across processes.
 *
 * @param stats - File stats from fs.stat()
 * @returns 6-character hexadecimal lease string
 */
export function leaseFromStat(stats: fs.Stats): string {
  // Use highest-precision timestamp available
  const mtime = stats.mtimeMs ?? stats.mtime.getTime();

  // We use size in case mtime is only second precision, which occurs on some
  // dated filesystems.
  const data = `${mtime}:${stats.size}`;

  // Use deterministic SHA-256 hash (no secret) so leases are consistent
  // across processes and restarts
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 6);
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

/**
 * Utility functions for reading file lines using sed
 * Used by the read-more feature in code review
 */

const LINES_PER_EXPANSION = 30;

/**
 * Determine which git ref to use for reading file context based on diffBase
 * @param diffBase - The diff base from review filters
 * @param includeUncommitted - Whether uncommitted changes are included
 * @returns Git ref to read old file from (empty string for working tree)
 */
export function getOldFileRef(diffBase: string, includeUncommitted: boolean): string {
  // For staged changes, old version is HEAD
  if (diffBase === "--staged") {
    return "HEAD";
  }

  // For uncommitted-only diffs, old version is HEAD
  if (diffBase === "HEAD") {
    return "HEAD";
  }

  // For branch diffs with uncommitted, we use merge-base as the old version
  if (includeUncommitted) {
    // Note: This would need to be computed dynamically via git merge-base
    // For simplicity, we'll use the diffBase ref itself
    return diffBase;
  }

  // For branch diffs without uncommitted (three-dot), old is at merge-base
  // But since three-dot shows merge-base..HEAD, we use HEAD as the old version
  return diffBase;
}

/**
 * Read lines from a file at a specific git ref using sed
 * @param workspaceId - The workspace ID
 * @param filePath - Path to the file relative to workspace root
 * @param startLine - Starting line number (1-indexed)
 * @param endLine - Ending line number (inclusive)
 * @param gitRef - Git reference to read from (e.g., "HEAD", "origin/main", or empty string for working tree)
 * @returns Array of lines or null if error
 */
export async function readFileLines(
  workspaceId: string,
  filePath: string,
  startLine: number,
  endLine: number,
  gitRef: string
): Promise<string[] | null> {
  // Ensure valid line range
  if (startLine < 1 || endLine < startLine) {
    return null;
  }

  // Build command: either read from git ref or working tree
  const script = gitRef
    ? // Read from git object database and pipe to sed for line range
      `git show "${gitRef}:${filePath.replace(/"/g, '\\"')}" | sed -n '${startLine},${endLine}p'`
    : // Read from working tree file
      `sed -n '${startLine},${endLine}p' "${filePath.replace(/"/g, '\\"')}"`;

  const result = await window.api.workspace.executeBash(workspaceId, script, {
    timeout_secs: 3,
  });

  if (!result.success) {
    console.error("Failed to read file lines:", result.error);
    return null;
  }

  // When success is true, output is always a string (type narrowing)
  const bashResult = result.data;
  if (!bashResult.output) {
    console.error("No output from bash command");
    return null;
  }

  // Split output into lines
  const lines = bashResult.output.split("\n");
  // Remove trailing empty line if present
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

/**
 * Calculate line range for expanding context upward
 * @param oldStart - Starting line number of the hunk in the old file
 * @param currentExpansion - Total number of lines to show above hunk (cumulative)
 * @returns Object with startLine and endLine for the expansion
 */
export function calculateUpwardExpansion(
  oldStart: number,
  currentExpansion: number
): { startLine: number; endLine: number; numLines: number } {
  // currentExpansion is the total lines to show, not the delta
  const startLine = Math.max(1, oldStart - currentExpansion);
  const endLine = oldStart - 1; // Always end right before hunk starts
  const numLines = Math.max(0, endLine - startLine + 1);

  return { startLine, endLine, numLines };
}

/**
 * Calculate line range for expanding context downward
 * @param oldStart - Starting line number of the hunk in the old file
 * @param oldLines - Number of lines in the hunk
 * @param currentExpansion - Total number of lines to show below hunk (cumulative)
 * @returns Object with startLine and endLine for the expansion
 */
export function calculateDownwardExpansion(
  oldStart: number,
  oldLines: number,
  currentExpansion: number
): { startLine: number; endLine: number; numLines: number } {
  const hunkEnd = oldStart + oldLines - 1;
  const startLine = hunkEnd + 1; // Always start right after hunk ends
  const endLine = hunkEnd + currentExpansion; // Extend by currentExpansion lines
  const numLines = Math.max(0, endLine - startLine + 1);

  return { startLine, endLine, numLines };
}

/**
 * Format expanded lines as diff context lines (prefix with space)
 */
export function formatAsContextLines(lines: string[]): string {
  return lines.map((line) => ` ${line}`).join("\n");
}

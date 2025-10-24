/**
 * Utility functions for reading file lines using sed
 * Used by the read-more feature in code review
 */

const LINES_PER_EXPANSION = 30;

/**
 * Read lines from a file using sed
 * @param workspaceId - The workspace ID
 * @param filePath - Path to the file relative to workspace root
 * @param startLine - Starting line number (1-indexed)
 * @param endLine - Ending line number (inclusive)
 * @returns Array of lines or null if error
 */
export async function readFileLines(
  workspaceId: string,
  filePath: string,
  startLine: number,
  endLine: number
): Promise<string[] | null> {
  // Ensure valid line range
  if (startLine < 1 || endLine < startLine) {
    return null;
  }

  // Use sed to read lines from the file
  // sed -n 'START,ENDp' FILE reads lines from START to END (inclusive)
  const script = `sed -n '${startLine},${endLine}p' "${filePath.replace(/"/g, '\\"')}"`;

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
 * @param currentExpansion - Current number of lines expanded upward
 * @returns Object with startLine and endLine for the expansion
 */
export function calculateUpwardExpansion(
  oldStart: number,
  currentExpansion: number
): { startLine: number; endLine: number; numLines: number } {
  const newExpansion = currentExpansion + LINES_PER_EXPANSION;
  const startLine = Math.max(1, oldStart - newExpansion);
  const endLine = oldStart - currentExpansion - 1;
  const numLines = endLine - startLine + 1;

  return { startLine, endLine, numLines };
}

/**
 * Calculate line range for expanding context downward
 * @param oldStart - Starting line number of the hunk in the old file
 * @param oldLines - Number of lines in the hunk
 * @param currentExpansion - Current number of lines expanded downward
 * @returns Object with startLine and endLine for the expansion
 */
export function calculateDownwardExpansion(
  oldStart: number,
  oldLines: number,
  currentExpansion: number
): { startLine: number; endLine: number; numLines: number } {
  const newExpansion = currentExpansion + LINES_PER_EXPANSION;
  const hunkEnd = oldStart + oldLines - 1;
  const startLine = hunkEnd + currentExpansion + 1;
  const endLine = hunkEnd + newExpansion;
  const numLines = endLine - startLine + 1;

  return { startLine, endLine, numLines };
}

/**
 * Format expanded lines as diff context lines (prefix with space)
 */
export function formatAsContextLines(lines: string[]): string {
  return lines.map((line) => ` ${line}`).join("\n");
}

/**
 * combineHunks - Combines hunks that overlap when expansion is applied
 *
 * When hunks are expanded, their context may overlap. This function detects
 * overlaps and combines hunks into composite hunks for display.
 */

import type { DiffHunk, HunkReadMoreState } from "@/types/review";
import { calculateUpwardExpansion, calculateDownwardExpansion } from "./readFileLines";

export interface HunkWithExpansion {
  hunk: DiffHunk;
  hunkId: string;
  expansion: HunkReadMoreState;
}

export interface CombinedHunk {
  /** Combined hunk for display (merged content) */
  displayHunk: DiffHunk;
  /** ID for the combined hunk */
  combinedId: string;
  /** Original hunks that were combined */
  sourceHunks: HunkWithExpansion[];
  /** Expansion state for display (max of all source hunks) */
  expansion: HunkReadMoreState;
}

/**
 * Calculate the effective line range of a hunk after expansion
 */
function getEffectiveRange(
  hunk: DiffHunk,
  expansion: HunkReadMoreState
): { start: number; end: number } {
  const upwardExp = calculateUpwardExpansion(hunk.oldStart, expansion.up);
  const downwardExp = calculateDownwardExpansion(hunk.oldStart, hunk.oldLines, expansion.down);

  const start = upwardExp.startLine >= 1 ? upwardExp.startLine : hunk.oldStart;
  const end = downwardExp.endLine;

  return { start, end };
}

/**
 * Check if two hunks overlap based on their expanded ranges
 * Only hunks from the same file can overlap
 */
function hunksOverlap(
  hunk1: HunkWithExpansion,
  hunk2: HunkWithExpansion,
  range1: { start: number; end: number },
  range2: { start: number; end: number }
): boolean {
  // Different files cannot overlap
  if (hunk1.hunk.filePath !== hunk2.hunk.filePath) {
    return false;
  }

  // Check if ranges overlap or are adjacent (within 3 lines)
  // Adjacent hunks should be combined for cleaner display
  const gap = range2.start - range1.end;
  return gap <= 3;
}

/**
 * Combine multiple hunks into a single display hunk
 */
function mergeHunks(hunksToMerge: HunkWithExpansion[]): CombinedHunk {
  if (hunksToMerge.length === 0) {
    throw new Error("Cannot merge empty hunk list");
  }

  if (hunksToMerge.length === 1) {
    const { hunk, hunkId, expansion } = hunksToMerge[0];
    return {
      displayHunk: hunk,
      combinedId: hunkId,
      sourceHunks: hunksToMerge,
      expansion,
    };
  }

  // Sort by line number
  const sorted = [...hunksToMerge].sort((a, b) => a.hunk.oldStart - b.hunk.oldStart);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Calculate combined range
  const firstRange = getEffectiveRange(first.hunk, first.expansion);
  const lastRange = getEffectiveRange(last.hunk, last.expansion);

  // Combine content (we'll just concatenate for now - the actual rendering
  // will handle showing the expanded content correctly)
  const combinedContent = sorted.map((h) => h.hunk.content).join("\n");

  // Create combined hunk
  const displayHunk: DiffHunk = {
    ...first.hunk,
    oldStart: firstRange.start,
    oldLines: lastRange.end - firstRange.start + 1,
    content: combinedContent,
  };

  // Calculate max expansion (we want to preserve the most expanded state)
  const maxExpansion: HunkReadMoreState = {
    up: Math.max(...sorted.map((h) => h.expansion.up)),
    down: Math.max(...sorted.map((h) => h.expansion.down)),
  };

  // Generate combined ID from all source IDs
  const combinedId = sorted.map((h) => h.hunkId).join("+");

  return {
    displayHunk,
    combinedId,
    sourceHunks: sorted,
    expansion: maxExpansion,
  };
}

/**
 * Combine hunks that overlap after expansion is applied
 *
 * @param hunks - Array of hunks with their expansion states
 * @returns Array of combined hunks (some may be single hunks, some combined)
 */
export function combineOverlappingHunks(hunks: HunkWithExpansion[]): CombinedHunk[] {
  if (hunks.length === 0) {
    return [];
  }

  // Sort by file path first, then by starting line number
  // This ensures we process files separately
  const sorted = [...hunks].sort((a, b) => {
    const fileCompare = a.hunk.filePath.localeCompare(b.hunk.filePath);
    if (fileCompare !== 0) return fileCompare;
    return a.hunk.oldStart - b.hunk.oldStart;
  });

  const result: CombinedHunk[] = [];
  let currentGroup: HunkWithExpansion[] = [sorted[0]];
  let currentRange = getEffectiveRange(sorted[0].hunk, sorted[0].expansion);

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const currentHunkRange = getEffectiveRange(current.hunk, current.expansion);

    // Pass the hunk objects to check file path matching
    if (hunksOverlap(currentGroup[0], current, currentRange, currentHunkRange)) {
      // Overlaps - add to current group
      currentGroup.push(current);
      // Extend the range to include this hunk
      currentRange.end = Math.max(currentRange.end, currentHunkRange.end);
    } else {
      // No overlap - finalize current group and start new one
      result.push(mergeHunks(currentGroup));
      currentGroup = [current];
      currentRange = currentHunkRange;
    }
  }

  // Don't forget the last group
  result.push(mergeHunks(currentGroup));

  return result;
}

import type { DiffHunk } from "@/types/review";

/**
 * Frontend hunk filters - applied to already-loaded hunks in memory.
 * For git-level filtering (path, diffBase), see ReviewPanel's loadDiff effect.
 */

/**
 * Filter hunks by read state
 * @param hunks - Hunks to filter
 * @param isRead - Function to check if a hunk is read
 * @param showRead - If true, show all hunks; if false, hide read hunks
 */
export function filterByReadState(
  hunks: DiffHunk[],
  isRead: (id: string) => boolean,
  showRead: boolean
): DiffHunk[] {
  if (showRead) return hunks;
  return hunks.filter((hunk) => !isRead(hunk.id));
}

/**
 * Filter hunks by search term
 * Searches in both filename and hunk content
 * @param hunks - Hunks to filter
 * @param searchTerm - Search string (substring or regex)
 * @param useRegex - If true, treat searchTerm as regex pattern
 */
export function filterBySearch(
  hunks: DiffHunk[],
  searchTerm: string,
  useRegex = false
): DiffHunk[] {
  if (!searchTerm.trim()) return hunks;

  if (useRegex) {
    try {
      const regex = new RegExp(searchTerm, "i"); // case-insensitive
      return hunks.filter((hunk) => {
        // Search in filename or hunk content
        return regex.test(hunk.filePath) || regex.test(hunk.content);
      });
    } catch {
      // Invalid regex - return empty array
      return [];
    }
  } else {
    // Substring search (case-insensitive)
    const searchLower = searchTerm.toLowerCase();
    return hunks.filter((hunk) => {
      // Search in filename
      if (hunk.filePath.toLowerCase().includes(searchLower)) {
        return true;
      }
      // Search in hunk content (includes context lines, not just changes)
      if (hunk.content.toLowerCase().includes(searchLower)) {
        return true;
      }
      return false;
    });
  }
}

/**
 * Apply all frontend filters in sequence.
 * Order matters: cheaper filters first (read state check < string search).
 *
 * @param hunks - Base hunks array to filter
 * @param filters - Filter configuration
 */
export function applyFrontendFilters(
  hunks: DiffHunk[],
  filters: {
    showReadHunks: boolean;
    isRead: (id: string) => boolean;
    searchTerm: string;
    useRegex?: boolean;
  }
): DiffHunk[] {
  let result = hunks;
  result = filterByReadState(result, filters.isRead, filters.showReadHunks);
  result = filterBySearch(result, filters.searchTerm, filters.useRegex);
  return result;
}

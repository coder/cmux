/**
 * Types for code review system
 */

/**
 * Individual hunk within a file diff
 */
export interface DiffHunk {
  /** Unique identifier for this hunk (hash of file path + line ranges) */
  id: string;
  /** Path to the file relative to workspace root */
  filePath: string;
  /** Starting line number in old file */
  oldStart: number;
  /** Number of lines in old file */
  oldLines: number;
  /** Starting line number in new file */
  newStart: number;
  /** Number of lines in new file */
  newLines: number;
  /** Diff content (lines starting with +/-/space) */
  content: string;
  /** Hunk header line (e.g., "@@ -1,5 +1,6 @@") */
  header: string;
  /** Change type from parent file */
  changeType?: "added" | "deleted" | "modified" | "renamed";
  /** Old file path (if renamed) */
  oldPath?: string;
}

/**
 * Parsed file diff containing multiple hunks
 */
export interface FileDiff {
  /** Path to the file relative to workspace root */
  filePath: string;
  /** Old file path (different if renamed) */
  oldPath?: string;
  /** Type of change */
  changeType: "added" | "deleted" | "modified" | "renamed";
  /** Whether this is a binary file */
  isBinary: boolean;
  /** Hunks in this file */
  hunks: DiffHunk[];
}

/**
 * User's review of a hunk
 */
export interface HunkReview {
  /** ID of the hunk being reviewed */
  hunkId: string;
  /** Review status */
  status: "accepted" | "rejected";
  /** Optional comment/note */
  note?: string;
  /** Timestamp when review was created/updated */
  timestamp: number;
}

/**
 * Workspace review state (persisted to localStorage)
 */
export interface ReviewState {
  /** Workspace ID this review belongs to */
  workspaceId: string;
  /** Reviews keyed by hunk ID */
  reviews: Record<string, HunkReview>;
  /** Timestamp of last update */
  lastUpdated: number;
}

/**
 * Filter options for review panel
 */
export interface ReviewFilters {
  /** Whether to show already-reviewed hunks */
  showReviewed: boolean;
  /** Status filter */
  statusFilter: "all" | "accepted" | "rejected" | "unreviewed";
  /** File path filter (regex or glob pattern) */
  filePathFilter?: string;
  /** Base reference to diff against (e.g., "HEAD", "main", "origin/main") */
  diffBase: string;
}

/**
 * Review statistics
 */
export interface ReviewStats {
  total: number;
  accepted: number;
  rejected: number;
  unreviewed: number;
}


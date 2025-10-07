/**
 * Represents a branch header from git show-branch
 */
export interface GitBranchHeader {
  /** Branch name (e.g., "HEAD", "origin/main") */
  branch: string;
  /** Column index (0-based) */
  columnIndex: number;
}

/**
 * Represents a single commit in the git log
 */
export interface GitCommit {
  /** Branch indicators from git show-branch (e.g., "+ +", "+++", "- -") */
  indicators: string;
  /** Short commit hash */
  hash: string;
  /** Formatted date string */
  date: string;
  /** Commit subject/message */
  subject: string;
}

/**
 * Result of parsing git show-branch output
 */
export interface GitShowBranchResult {
  headers: GitBranchHeader[];
  commits: GitCommit[];
}

/**
 * Parses git show-branch output.
 * Expected format:
 *   Header section:
 *     [!*] [branch-name] commit-subject
 *     ...
 *   ---
 *   Commit section:
 *     <indicators> [<hash>] <subject>
 *     ...
 *
 * Example:
 *   ! [HEAD] Latest commit on HEAD
 *    ! [origin/main] Latest commit on origin/main
 *   ---
 *   + + [042118f] Clear providerMetadata from tool messages too
 *
 * Note: Dates are fetched separately and merged in via hash lookup.
 */
export function parseGitShowBranch(
  output: string,
  dateMap: Map<string, string>
): GitShowBranchResult {
  if (!output?.trim()) {
    return { headers: [], commits: [] };
  }

  const lines = output.trim().split("\n");
  const headers: GitBranchHeader[] = [];
  const commits: GitCommit[] = [];
  let inCommitSection = false;

  for (const line of lines) {
    // Skip until we find the separator "---"
    if (line.trim() === "---") {
      inCommitSection = true;
      continue;
    }

    if (!inCommitSection) {
      // Parse header lines: [!*] [branch-name] commit-subject
      // The column index is determined by the position of the first non-space character
      const headerMatch = /^(\s*)[!*]\s+\[([^\]]+)\]/.exec(line);
      if (headerMatch) {
        const [, leadingSpaces, branchName] = headerMatch;
        const columnIndex = leadingSpaces.length;
        headers.push({
          branch: branchName,
          columnIndex,
        });
      }
      continue;
    }

    // Match: <indicators> [<hash>] <subject>
    // Indicators are the first N chars (one per branch), followed by space, then [hash]
    const match = /^(.+?)\s+\[([a-f0-9]+)\]\s+(.+)$/.exec(line);

    if (!match) {
      continue; // Skip lines that don't match
    }

    const [, indicators, hash, subject] = match;

    commits.push({
      indicators: indicators.trim(),
      hash: hash.trim(),
      date: dateMap.get(hash.trim()) ?? "",
      subject: subject.trim(),
    });
  }

  return { headers, commits };
}

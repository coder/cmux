/**
 * Sanitize a branch name for use as a directory name.
 * Converts forward slashes to dashes to make branch names filesystem-safe.
 *
 * This is the single source of truth for branch → directory name conversion.
 *
 * @param branchName - The git branch name (may contain slashes)
 * @returns Sanitized directory name (slashes replaced with dashes)
 */
export function sanitizeBranchNameForDirectory(branchName: string): string {
  return branchName.replace(/\//g, "-");
}

/**
 * Detect if a new branch name would conflict with existing workspaces.
 * Returns the name of the conflicting workspace if found, null otherwise.
 *
 * @param newBranchName - The branch name being created/renamed to
 * @param existingBranchNames - List of existing workspace branch names
 * @returns Name of conflicting branch, or null if no conflict
 */
export function detectDirectoryNameConflict(
  newBranchName: string,
  existingBranchNames: string[]
): string | null {
  const newDirName = sanitizeBranchNameForDirectory(newBranchName);

  for (const existingName of existingBranchNames) {
    const existingDirName = sanitizeBranchNameForDirectory(existingName);
    if (newDirName === existingDirName && newBranchName !== existingName) {
      return existingName;
    }
  }

  return null;
}

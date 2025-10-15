import * as fsPromises from "fs/promises";
import * as path from "path";
import { execAsync } from "@/utils/disposableExec";

export interface WorktreeResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Check if a worktree has uncommitted changes or untracked files
 * Returns true if the worktree is clean (safe to delete), false otherwise
 */
export async function isWorktreeClean(workspacePath: string): Promise<boolean> {
  try {
    // Check for uncommitted changes (staged or unstaged)
    using proc = execAsync(`git -C "${workspacePath}" status --porcelain`);
    const { stdout: statusOutput } = await proc.result;
    return statusOutput.trim() === "";
  } catch {
    // If git command fails, assume not clean (safer default)
    return false;
  }
}

/**
 * Check if a worktree contains submodules
 * Returns true if .gitmodules file exists, false otherwise
 */
export async function hasSubmodules(workspacePath: string): Promise<boolean> {
  try {
    const gitmodulesPath = path.join(workspacePath, ".gitmodules");
    await fsPromises.access(gitmodulesPath);
    return true;
  } catch {
    return false;
  }
}

export async function removeWorktree(
  projectPath: string,
  workspacePath: string,
  options: { force: boolean } = { force: false }
): Promise<WorktreeResult> {
  try {
    // Remove the worktree (from the main repository context)
    using proc = execAsync(
      `git -C "${projectPath}" worktree remove "${workspacePath}" ${options.force ? "--force" : ""}`
    );
    await proc.result;
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function pruneWorktrees(projectPath: string): Promise<WorktreeResult> {
  try {
    using proc = execAsync(`git -C "${projectPath}" worktree prune`);
    await proc.result;
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Remove a worktree with optimized UX for clean worktrees.
 *
 * Strategy:
 * - Clean worktrees (no uncommitted changes): Instant removal via rename+background delete
 * - Dirty worktrees: Standard git removal (blocks UI but prevents data loss)
 * - Missing worktrees: Prune from git records
 *
 * This provides instant feedback for the common case (clean worktrees) while
 * preserving git's safety checks for uncommitted changes.
 *
 * IMPORTANT: This function NEVER uses --force. It will fail and return an error if:
 * - Worktree has uncommitted changes
 * - Worktree contains submodules (git refuses to remove without --force)
 * The caller (frontend) will show a force delete modal, and the user can retry with force: true.
 *
 * @param projectPath - Path to the main git repository
 * @param workspacePath - Path to the worktree to remove
 * @param options.onBackgroundDelete - Optional callback for background deletion (for logging)
 * @returns WorktreeResult indicating success or failure
 */
export async function removeWorktreeSafe(
  projectPath: string,
  workspacePath: string,
  options?: { onBackgroundDelete?: (tempDir: string, error?: Error) => void }
): Promise<WorktreeResult> {
  // Check if worktree exists
  const worktreeExists = await fsPromises
    .access(workspacePath)
    .then(() => true)
    .catch(() => false);

  if (!worktreeExists) {
    // Worktree already deleted - prune git records
    const pruneResult = await pruneWorktrees(projectPath);
    if (!pruneResult.success) {
      // Log but don't fail - worktree is gone which is what we wanted
      options?.onBackgroundDelete?.(workspacePath, new Error(pruneResult.error));
    }
    return { success: true };
  }

  // Check if worktree is clean (no uncommitted changes)
  const isClean = await isWorktreeClean(workspacePath);

  if (isClean) {
    // Strategy: Instant removal for clean worktrees
    // Rename to temp directory (instant), prune git records, delete in background
    const tempDir = path.join(
      path.dirname(workspacePath),
      `.deleting-${path.basename(workspacePath)}-${Date.now()}`
    );

    try {
      // Rename to temp location (instant operation)
      await fsPromises.rename(workspacePath, tempDir);

      // Prune the worktree from git's records
      await pruneWorktrees(projectPath);

      // Delete the temp directory in the background
      void fsPromises.rm(tempDir, { recursive: true, force: true }).catch((err) => {
        options?.onBackgroundDelete?.(tempDir, err as Error);
      });

      return { success: true };
    } catch {
      // Rollback rename if it succeeded
      const tempExists = await fsPromises
        .access(tempDir)
        .then(() => true)
        .catch(() => false);

      if (tempExists) {
        await fsPromises.rename(tempDir, workspacePath).catch(() => {
          // If rollback fails, fall through to sync removal
        });
      }
      // Fall through to sync removal below
    }
  }

  // For dirty worktrees OR if instant removal failed:
  // Use regular git worktree remove (respects git safety checks)
  const stillExists = await fsPromises
    .access(workspacePath)
    .then(() => true)
    .catch(() => false);

  if (stillExists) {
    // Try normal git removal without force
    // If worktree has uncommitted changes or submodules, this will fail
    // and the error will be shown to the user who can then force delete
    const gitResult = await removeWorktree(projectPath, workspacePath, { force: false });

    if (!gitResult.success) {
      const errorMessage = gitResult.error ?? "Unknown error";
      const normalizedError = errorMessage.toLowerCase();
      const looksLikeMissingWorktree =
        normalizedError.includes("not a working tree") ||
        normalizedError.includes("does not exist") ||
        normalizedError.includes("no such file");

      if (looksLikeMissingWorktree) {
        // Path is missing from git's perspective - prune it
        const pruneResult = await pruneWorktrees(projectPath);
        if (!pruneResult.success) {
          options?.onBackgroundDelete?.(workspacePath, new Error(pruneResult.error));
        }
        return { success: true };
      }

      // Real git error (e.g., uncommitted changes) - propagate to caller
      return gitResult;
    }
  }

  return { success: true };
}

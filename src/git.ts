import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import type { Config } from "./config";

const execAsync = promisify(exec);

export interface WorktreeResult {
  success: boolean;
  path?: string;
  error?: string;
}

export async function createWorktree(
  config: Config,
  projectPath: string,
  branchName: string
): Promise<WorktreeResult> {
  try {
    const workspacePath = config.getWorkspacePath(projectPath, branchName);

    // Create workspace directory if it doesn't exist
    if (!fs.existsSync(path.dirname(workspacePath))) {
      fs.mkdirSync(path.dirname(workspacePath), { recursive: true });
    }

    // Check if workspace already exists
    if (fs.existsSync(workspacePath)) {
      return {
        success: false,
        error: `Workspace already exists at ${workspacePath}`,
      };
    }

    // Check if branch exists
    const { stdout: branches } = await execAsync(`git -C "${projectPath}" branch -a`);
    const branchExists = branches
      .split("\n")
      .some(
        (b) =>
          b.trim() === branchName ||
          b.trim() === `* ${branchName}` ||
          b.trim() === `remotes/origin/${branchName}`
      );

    if (branchExists) {
      // Branch exists, create worktree with existing branch
      await execAsync(`git -C "${projectPath}" worktree add "${workspacePath}" "${branchName}"`);
    } else {
      // Branch doesn't exist, create new branch with worktree
      await execAsync(`git -C "${projectPath}" worktree add -b "${branchName}" "${workspacePath}"`);
    }

    return { success: true, path: workspacePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Check if a worktree has uncommitted changes or untracked files
 * Returns true if the worktree is clean (safe to delete), false otherwise
 */
export async function isWorktreeClean(workspacePath: string): Promise<boolean> {
  try {
    // Check for uncommitted changes (staged or unstaged)
    const { stdout: statusOutput } = await execAsync(`git -C "${workspacePath}" status --porcelain`);
    return statusOutput.trim() === "";
  } catch {
    // If git command fails, assume not clean (safer default)
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
    await execAsync(
      `git -C "${projectPath}" worktree remove "${workspacePath}" ${options.force ? "--force" : ""}`
    );
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function pruneWorktrees(projectPath: string): Promise<WorktreeResult> {
  try {
    await execAsync(`git -C "${projectPath}" worktree prune`);
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

export async function moveWorktree(
  projectPath: string,
  oldPath: string,
  newPath: string
): Promise<WorktreeResult> {
  try {
    // Check if new path already exists
    if (fs.existsSync(newPath)) {
      return {
        success: false,
        error: `Target path already exists: ${newPath}`,
      };
    }

    // Create parent directory for new path if needed
    const parentDir = path.dirname(newPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Move the worktree using git (from the main repository context)
    await execAsync(`git -C "${projectPath}" worktree move "${oldPath}" "${newPath}"`);
    return { success: true, path: newPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function listWorktrees(projectPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(`git -C "${projectPath}" worktree list --porcelain`);
    const worktrees: string[] = [];
    const lines = stdout.split("\n");

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        const path = line.slice("worktree ".length);
        if (path !== projectPath) {
          // Exclude main worktree
          worktrees.push(path);
        }
      }
    }

    return worktrees;
  } catch (error) {
    console.error("Error listing worktrees:", error);
    return [];
  }
}

export async function isGitRepository(projectPath: string): Promise<boolean> {
  try {
    await execAsync(`git -C "${projectPath}" rev-parse --git-dir`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the main repository path from a worktree path
 * @param worktreePath Path to a git worktree
 * @returns Path to the main repository, or null if not found
 */
export async function getMainWorktreeFromWorktree(worktreePath: string): Promise<string | null> {
  try {
    // Get the worktree list from the worktree itself
    const { stdout } = await execAsync(`git -C "${worktreePath}" worktree list --porcelain`);
    const lines = stdout.split("\n");

    // The first worktree in the list is always the main worktree
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        return line.slice("worktree ".length);
      }
    }

    return null;
  } catch {
    return null;
  }
}

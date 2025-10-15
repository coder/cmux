import * as fs from "fs";
import * as path from "path";
import type { Config } from "./config";
import { execAsync } from "./utils/disposableExec";

export interface WorktreeResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface CreateWorktreeOptions {
  trunkBranch: string;
  /** Workspace ID to use for directory name (if not provided, uses branchName) */
  workspaceId?: string;
}

export async function listLocalBranches(projectPath: string): Promise<string[]> {
  using proc = execAsync(
    `git -C "${projectPath}" for-each-ref --format="%(refname:short)" refs/heads`
  );
  const { stdout } = await proc.result;
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

async function getCurrentBranch(projectPath: string): Promise<string | null> {
  try {
    using proc = execAsync(`git -C "${projectPath}" rev-parse --abbrev-ref HEAD`);
    const { stdout } = await proc.result;
    const branch = stdout.trim();
    if (!branch || branch === "HEAD") {
      return null;
    }
    return branch;
  } catch {
    return null;
  }
}

const FALLBACK_TRUNK_CANDIDATES = ["main", "master", "trunk", "develop", "default"];

export async function detectDefaultTrunkBranch(
  projectPath: string,
  branches?: string[]
): Promise<string> {
  const branchList = branches ?? (await listLocalBranches(projectPath));

  if (branchList.length === 0) {
    throw new Error(`No branches available in repository ${projectPath}`);
  }

  const branchSet = new Set(branchList);
  const currentBranch = await getCurrentBranch(projectPath);

  if (currentBranch && branchSet.has(currentBranch)) {
    return currentBranch;
  }

  for (const candidate of FALLBACK_TRUNK_CANDIDATES) {
    if (branchSet.has(candidate)) {
      return candidate;
    }
  }

  return branchList[0];
}

export async function createWorktree(
  config: Config,
  projectPath: string,
  branchName: string,
  options: CreateWorktreeOptions
): Promise<WorktreeResult> {
  try {
    // Use workspaceId for directory name if provided, otherwise fall back to branchName (legacy)
    const directoryName = options.workspaceId ?? branchName;
    const workspacePath = config.getWorkspacePath(projectPath, directoryName);
    const { trunkBranch } = options;
    const normalizedTrunkBranch = typeof trunkBranch === "string" ? trunkBranch.trim() : "";

    if (!normalizedTrunkBranch) {
      return {
        success: false,
        error: "Trunk branch is required to create a workspace",
      };
    }

    console.assert(
      normalizedTrunkBranch.length > 0,
      "Expected trunk branch to be validated before calling createWorktree"
    );

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

    const localBranches = await listLocalBranches(projectPath);

    // If branch already exists locally, reuse it instead of creating a new one
    if (localBranches.includes(branchName)) {
      using proc = execAsync(
        `git -C "${projectPath}" worktree add "${workspacePath}" "${branchName}"`
      );
      await proc.result;
      return { success: true, path: workspacePath };
    }

    // Check if branch exists remotely (origin/<branchName>)
    using remoteBranchesProc = execAsync(`git -C "${projectPath}" branch -a`);
    const { stdout: remoteBranchesRaw } = await remoteBranchesProc.result;
    const branchExists = remoteBranchesRaw
      .split("\n")
      .map((b) => b.trim().replace(/^(\*)\s+/, ""))
      .some((b) => b === branchName || b === `remotes/origin/${branchName}`);

    if (branchExists) {
      using proc = execAsync(
        `git -C "${projectPath}" worktree add "${workspacePath}" "${branchName}"`
      );
      await proc.result;
      return { success: true, path: workspacePath };
    }

    if (!localBranches.includes(normalizedTrunkBranch)) {
      return {
        success: false,
        error: `Trunk branch "${normalizedTrunkBranch}" does not exist locally`,
      };
    }

    using proc = execAsync(
      `git -C "${projectPath}" worktree add -b "${branchName}" "${workspacePath}" "${normalizedTrunkBranch}"`
    );
    await proc.result;

    return { success: true, path: workspacePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
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
    using proc = execAsync(`git -C "${projectPath}" worktree move "${oldPath}" "${newPath}"`);
    await proc.result;
    return { success: true, path: newPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function listWorktrees(projectPath: string): Promise<string[]> {
  try {
    using proc = execAsync(`git -C "${projectPath}" worktree list --porcelain`);
    const { stdout } = await proc.result;
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
    using proc = execAsync(`git -C "${projectPath}" rev-parse --git-dir`);
    await proc.result;
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
    using proc = execAsync(`git -C "${worktreePath}" worktree list --porcelain`);
    const { stdout } = await proc.result;
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

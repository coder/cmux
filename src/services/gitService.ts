import assert from "node:assert/strict";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import type { Config } from "@/config";
import { execAsync } from "@/utils/disposableExec";

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

    if (!fs.existsSync(path.dirname(workspacePath))) {
      fs.mkdirSync(path.dirname(workspacePath), { recursive: true });
    }

    if (fs.existsSync(workspacePath)) {
      return {
        success: false,
        error: `Workspace already exists at ${workspacePath}`,
      };
    }

    using branchesProc = execAsync(`git -C "${projectPath}" branch -a`);
    const { stdout: branches } = await branchesProc.result;
    const branchExists = branches
      .split("\n")
      .some(
        (b) =>
          b.trim() === branchName ||
          b.trim() === `* ${branchName}` ||
          b.trim() === `remotes/origin/${branchName}`
      );

    if (branchExists) {
      using proc = execAsync(
        `git -C "${projectPath}" worktree add "${workspacePath}" "${branchName}"`
      );
      await proc.result;
    } else {
      using proc = execAsync(
        `git -C "${projectPath}" worktree add -b "${branchName}" "${workspacePath}"`
      );
      await proc.result;
    }

    return { success: true, path: workspacePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function isWorktreeClean(workspacePath: string): Promise<boolean> {
  try {
    using proc = execAsync(`git -C "${workspacePath}" status --porcelain`);
    const { stdout: statusOutput } = await proc.result;
    return statusOutput.trim() === "";
  } catch {
    return false;
  }
}

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

export async function removeWorktreeSafe(
  projectPath: string,
  workspacePath: string,
  options?: { onBackgroundDelete?: (tempDir: string, error?: Error) => void }
): Promise<WorktreeResult> {
  const worktreeExists = await fsPromises
    .access(workspacePath)
    .then(() => true)
    .catch(() => false);

  if (!worktreeExists) {
    const pruneResult = await pruneWorktrees(projectPath);
    if (!pruneResult.success) {
      options?.onBackgroundDelete?.(workspacePath, new Error(pruneResult.error));
    }
    return { success: true };
  }

  const isClean = await isWorktreeClean(workspacePath);

  if (isClean) {
    const tempDir = path.join(
      path.dirname(workspacePath),
      `.deleting-${path.basename(workspacePath)}-${Date.now()}`
    );

    try {
      await fsPromises.rename(workspacePath, tempDir);
      await pruneWorktrees(projectPath);
      void fsPromises.rm(tempDir, { recursive: true, force: true }).catch((err) => {
        options?.onBackgroundDelete?.(tempDir, err as Error);
      });
      return { success: true };
    } catch {
      const tempExists = await fsPromises
        .access(tempDir)
        .then(() => true)
        .catch(() => false);

      if (tempExists) {
        await fsPromises.rename(tempDir, workspacePath).catch(() => {
          // Best effort rollback
        });
      }
    }
  }

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
        const pruneResult = await pruneWorktrees(projectPath);
        if (!pruneResult.success) {
          options?.onBackgroundDelete?.(workspacePath, new Error(pruneResult.error));
        }
        return { success: true };
      }

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
    if (fs.existsSync(newPath)) {
      return {
        success: false,
        error: `Target path already exists: ${newPath}`,
      };
    }

    const parentDir = path.dirname(newPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

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
        const candidate = line.slice("worktree ".length);
        if (candidate !== projectPath) {
          worktrees.push(candidate);
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

export async function getMainWorktreeFromWorktree(worktreePath: string): Promise<string | null> {
  try {
    using proc = execAsync(`git -C "${worktreePath}" worktree list --porcelain`);
    const { stdout } = await proc.result;
    const lines = stdout.split("\n");

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

export interface RebaseResult {
  success: boolean;
  status: "completed" | "conflicts" | "aborted";
  conflictFiles?: string[];
  error?: string;
  errorStack?: string;
  step?: string;
  stashed?: boolean;
}

async function resolveGitDir(workspacePath: string): Promise<string> {
  const defaultGitPath = path.join(workspacePath, ".git");

  try {
    using proc = execAsync(`git -C "${workspacePath}" rev-parse --absolute-git-dir`);
    const { stdout } = await proc.result;
    const resolved = stdout.trim();
    if (resolved) {
      return resolved;
    }
  } catch {
    // Fallback to default path
  }

  return defaultGitPath;
}

export async function isRebaseInProgress(workspacePath: string): Promise<boolean> {
  assert(workspacePath, "workspacePath required");
  assert(typeof workspacePath === "string", "workspacePath must be a string");
  assert(workspacePath.trim().length > 0, "workspacePath must not be empty");
  assert(fs.existsSync(workspacePath), `Workspace path does not exist: ${workspacePath}`);

  const gitDir = await resolveGitDir(workspacePath);
  const rebaseMerge = path.join(gitDir, "rebase-merge");
  const rebaseApply = path.join(gitDir, "rebase-apply");
  return fs.existsSync(rebaseMerge) || fs.existsSync(rebaseApply);
}

export async function gatherGitDiagnostics(workspacePath: string): Promise<string> {
  const diagnostics: string[] = [];

  // Check if rebase in progress and get original branch if so
  let originalBranch: string | null = null;
  try {
    const gitDir = await resolveGitDir(workspacePath);
    const headNameFile = path.join(gitDir, "rebase-merge", "head-name");

    if (fs.existsSync(headNameFile)) {
      const headName = await fsPromises.readFile(headNameFile, "utf-8");
      // Format: "refs/heads/my-feature" → extract "my-feature"
      originalBranch = headName.trim().replace(/^refs\/heads\//, "");
    }
  } catch {
    // Ignore errors reading rebase state
  }

  try {
    using branchProc = execAsync(`git -C "${workspacePath}" rev-parse --abbrev-ref HEAD 2>&1`);
    const { stdout: branch } = await branchProc.result;
    const currentBranch = branch.trim();

    if (originalBranch && currentBranch === "HEAD") {
      // During rebase: show both original branch and detached HEAD state
      diagnostics.push(`Branch (before rebase): ${originalBranch}`);
      diagnostics.push(`Current state: detached HEAD (rebase in progress)`);
    } else {
      // Normal case: just show current branch
      diagnostics.push(`Current branch: ${currentBranch}`);
    }
  } catch (error) {
    diagnostics.push(
      `Current branch: Error - ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    using statusProc = execAsync(`git -C "${workspacePath}" status --short 2>&1`);
    const { stdout: status } = await statusProc.result;
    diagnostics.push(
      status.trim() ? `\nGit status:\n${status.trim()}` : "\nGit status: Working tree clean"
    );
  } catch (error) {
    diagnostics.push(
      `\nGit status: Error - ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    const rebaseInProgress = await isRebaseInProgress(workspacePath);
    if (rebaseInProgress) {
      diagnostics.push("\nRebase state: IN PROGRESS");
    }
  } catch {
    // Ignore rebase state errors
  }

  try {
    using stashProc = execAsync(`git -C "${workspacePath}" stash list 2>&1`);
    const { stdout: stashList } = await stashProc.result;
    const trimmed = stashList.trim();
    if (trimmed) {
      const stashes = trimmed.split("\n");
      diagnostics.push(`\nStash entries: ${stashes.length}`);
      if (stashes.length > 0) {
        diagnostics.push(`Latest stash: ${stashes[0]}`);
      }
    }
  } catch {
    // Ignore stash errors
  }

  return diagnostics.join("\n");
}

export async function abortRebase(workspacePath: string): Promise<WorktreeResult> {
  assert(workspacePath, "workspacePath required");
  assert(typeof workspacePath === "string", "workspacePath must be a string");
  assert(workspacePath.trim().length > 0, "workspacePath must not be empty");
  assert(fs.existsSync(workspacePath), `Workspace path does not exist: ${workspacePath}`);

  try {
    using proc = execAsync(`git -C "${workspacePath}" rebase --abort`);
    await proc.result;
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function rebaseOntoTrunk(
  workspacePath: string,
  trunkBranch: string
): Promise<RebaseResult> {
  let currentStep = "validation";

  assert(workspacePath, "workspacePath required");
  assert(workspacePath.trim().length > 0, "workspacePath must not be empty");
  assert(trunkBranch, "trunkBranch required");
  assert(trunkBranch.trim().length > 0, "trunkBranch must not be empty");
  assert(fs.existsSync(workspacePath), `Workspace path does not exist: ${workspacePath}`);

  try {
    currentStep = "checking HEAD state";
    try {
      using headProc = execAsync(`git -C "${workspacePath}" symbolic-ref -q HEAD`);
      const { stdout: headCheck } = await headProc.result;
      if (!headCheck.trim()) {
        return {
          success: false,
          status: "aborted",
          error: "Cannot rebase in detached HEAD state",
          step: currentStep,
        };
      }
    } catch (headError) {
      return {
        success: false,
        status: "aborted",
        error:
          headError instanceof Error && headError.message
            ? headError.message
            : "Cannot rebase in detached HEAD state",
        step: currentStep,
      };
    }

    currentStep = "checking for existing rebase";
    const rebaseInProgress = await isRebaseInProgress(workspacePath);
    assert(!rebaseInProgress, "Cannot start rebase - rebase already in progress");

    currentStep = "fetching from origin";
    try {
      using fetchProc = execAsync(`git -C "${workspacePath}" fetch origin`);
      await fetchProc.result;
    } catch {
      // Fetch failures are not fatal – continue with existing refs
    }

    currentStep = `rebasing onto origin/${trunkBranch}`;
    try {
      using rebaseProc = execAsync(
        `git -C "${workspacePath}" rebase --autostash origin/${trunkBranch}`
      );
      await rebaseProc.result;

      const result: RebaseResult = {
        success: true,
        status: "completed",
        stashed: false,
      };

      return result;
    } catch (error) {
      let conflictFiles: string[] = [];
      try {
        using conflictsProc = execAsync(
          `git -C "${workspacePath}" diff --name-only --diff-filter=U`
        );
        const { stdout: conflicts } = await conflictsProc.result;
        conflictFiles = conflicts
          .split("\n")
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
      } catch {
        conflictFiles = [];
      }

      const result: RebaseResult = {
        success: false,
        status: "conflicts",
        conflictFiles,
        error: `Rebase conflicts detected: ${error instanceof Error ? error.message : String(error)}`,
        stashed: false,
        step: currentStep,
      };

      return result;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const result: RebaseResult = {
      success: false,
      status: "aborted",
      error: message,
      errorStack: stack,
      step: currentStep,
    };

    assert(result.error, "Aborted result must have error message");

    return result;
  }
}

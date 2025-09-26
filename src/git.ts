import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { getWorkspacePath } from "./config";

const execAsync = promisify(exec);

export interface WorktreeResult {
  success: boolean;
  path?: string;
  error?: string;
}

export async function createWorktree(
  projectPath: string,
  branchName: string
): Promise<WorktreeResult> {
  try {
    const workspacePath = getWorkspacePath(projectPath, branchName);

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
          b.includes(`remotes/origin/${branchName}`)
      );

    if (branchExists) {
      // Branch exists, create worktree with existing branch
      await execAsync(`git -C "${projectPath}" worktree add "${workspacePath}" "${branchName}"`);
    } else {
      // Branch doesn't exist, create new branch with worktree
      await execAsync(`git -C "${projectPath}" worktree add -b "${branchName}" "${workspacePath}"`);
    }

    return { success: true, path: workspacePath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function removeWorktree(workspacePath: string): Promise<WorktreeResult> {
  try {
    // Remove the worktree
    await execAsync(`git worktree remove "${workspacePath}" --force`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function listWorktrees(projectPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(`git -C "${projectPath}" worktree list --porcelain`);
    const worktrees: string[] = [];
    const lines = stdout.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("worktree ")) {
        const path = lines[i].substring(9);
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

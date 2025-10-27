import { execAsync } from "@/utils/disposableExec";

export interface WorktreeResult {
  success: boolean;
  path?: string;
  error?: string;
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

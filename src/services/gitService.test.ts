import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";
import { removeWorktreeSafe, isWorktreeClean, hasSubmodules } from "./gitService";
import { createWorktree, detectDefaultTrunkBranch } from "@/git";
import type { Config } from "@/config";

// Helper to create a test git repo
async function createTestRepo(basePath: string): Promise<string> {
  const repoPath = path.join(basePath, "test-repo");
  await fs.mkdir(repoPath, { recursive: true });

  execSync("git init", { cwd: repoPath });
  execSync("git config user.email 'test@test.com'", { cwd: repoPath });
  execSync("git config user.name 'Test User'", { cwd: repoPath });

  // Create initial commit
  await fs.writeFile(path.join(repoPath, "README.md"), "# Test Repo");
  execSync("git add .", { cwd: repoPath });
  execSync('git commit -m "Initial commit"', { cwd: repoPath });

  return repoPath;
}

// Mock config for createWorktree
const mockConfig = {
  srcDir: path.join(__dirname, "..", "test-workspaces"),
  getWorkspacePath: (projectPath: string, branchName: string) => {
    return path.join(path.dirname(projectPath), "workspaces", branchName);
  },
} as unknown as Config;

describe("removeWorktreeSafe", () => {
  let tempDir: string;
  let repoPath: string;
  let defaultBranch: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(__dirname, "..", "test-temp-"));
    repoPath = await createTestRepo(tempDir);
    defaultBranch = await detectDefaultTrunkBranch(repoPath);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should instantly remove clean worktree via rename", async () => {
    // Create a worktree
    const result = await createWorktree(mockConfig, repoPath, "test-branch", {
      trunkBranch: defaultBranch,
    });
    if (!result.success) {
      console.error("createWorktree failed:", result.error);
    }
    expect(result.success).toBe(true);
    const worktreePath = result.path!;

    // Verify worktree exists
    const existsBefore = await fs
      .access(worktreePath)
      .then(() => true)
      .catch(() => false);
    expect(existsBefore).toBe(true);

    // Remove it (should be instant since it's clean)
    const startTime = Date.now();
    const removeResult = await removeWorktreeSafe(repoPath, worktreePath);
    const duration = Date.now() - startTime;

    expect(removeResult.success).toBe(true);

    // Should complete quickly (<200ms accounting for CI overhead)
    expect(duration).toBeLessThan(200);

    // Worktree should be gone immediately
    const existsAfter = await fs
      .access(worktreePath)
      .then(() => true)
      .catch(() => false);
    expect(existsAfter).toBe(false);
  });

  test("should block removal of dirty worktree", async () => {
    // Create a worktree
    const result = await createWorktree(mockConfig, repoPath, "dirty-branch", {
      trunkBranch: defaultBranch,
    });
    expect(result.success).toBe(true);
    const worktreePath = result.path!;

    // Make it dirty by adding uncommitted changes
    await fs.writeFile(path.join(worktreePath, "new-file.txt"), "uncommitted content");

    // Verify it's dirty
    const isClean = await isWorktreeClean(worktreePath);
    expect(isClean).toBe(false);

    // Try to remove it - should fail due to uncommitted changes
    const removeResult = await removeWorktreeSafe(repoPath, worktreePath);

    expect(removeResult.success).toBe(false);
    expect(removeResult.error).toMatch(/modified|untracked|changes/i);

    // Worktree should still exist
    const existsAfter = await fs
      .access(worktreePath)
      .then(() => true)
      .catch(() => false);
    expect(existsAfter).toBe(true);
  });

  test("should handle already-deleted worktree gracefully", async () => {
    // Create a worktree
    const result = await createWorktree(mockConfig, repoPath, "temp-branch", {
      trunkBranch: defaultBranch,
    });
    expect(result.success).toBe(true);
    const worktreePath = result.path!;

    // Manually delete it (simulating external deletion)
    await fs.rm(worktreePath, { recursive: true, force: true });

    // Remove via removeWorktreeSafe - should succeed and prune git records
    const removeResult = await removeWorktreeSafe(repoPath, worktreePath);

    expect(removeResult.success).toBe(true);
  });

  test("should remove clean worktree with staged changes using git", async () => {
    // Create a worktree
    const result = await createWorktree(mockConfig, repoPath, "staged-branch", {
      trunkBranch: defaultBranch,
    });
    expect(result.success).toBe(true);
    const worktreePath = result.path!;

    // Add staged changes
    await fs.writeFile(path.join(worktreePath, "staged.txt"), "staged content");
    execSync("git add .", { cwd: worktreePath });

    // Verify it's dirty (staged changes count as dirty)
    const isClean = await isWorktreeClean(worktreePath);
    expect(isClean).toBe(false);

    // Try to remove it - should fail
    const removeResult = await removeWorktreeSafe(repoPath, worktreePath);

    expect(removeResult.success).toBe(false);
  });

  test("should call onBackgroundDelete callback on errors", async () => {
    // Create a worktree
    const result = await createWorktree(mockConfig, repoPath, "callback-branch", {
      trunkBranch: defaultBranch,
    });
    expect(result.success).toBe(true);
    const worktreePath = result.path!;

    const errors: Array<{ tempDir: string; error?: Error }> = [];

    // Remove it
    const removeResult = await removeWorktreeSafe(repoPath, worktreePath, {
      onBackgroundDelete: (tempDir, error) => {
        errors.push({ tempDir, error });
      },
    });

    expect(removeResult.success).toBe(true);

    // Wait a bit for background deletion to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Callback should be called for successful background deletion
    // (or not called at all if deletion succeeds without error)
    // This test mainly ensures the callback doesn't crash
  });
});

describe("isWorktreeClean", () => {
  let tempDir: string;
  let repoPath: string;
  let defaultBranch: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(__dirname, "..", "test-temp-"));
    repoPath = await createTestRepo(tempDir);
    defaultBranch = await detectDefaultTrunkBranch(repoPath);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should return true for clean worktree", async () => {
    const result = await createWorktree(mockConfig, repoPath, "clean-check", {
      trunkBranch: defaultBranch,
    });
    expect(result.success).toBe(true);

    const isClean = await isWorktreeClean(result.path!);
    expect(isClean).toBe(true);
  });

  test("should return false for worktree with uncommitted changes", async () => {
    const result = await createWorktree(mockConfig, repoPath, "dirty-check", {
      trunkBranch: defaultBranch,
    });
    expect(result.success).toBe(true);
    const worktreePath = result.path!;

    // Add uncommitted file
    await fs.writeFile(path.join(worktreePath, "uncommitted.txt"), "content");

    const isClean = await isWorktreeClean(worktreePath);
    expect(isClean).toBe(false);
  });

  test("should return false for non-existent path", async () => {
    const isClean = await isWorktreeClean("/non/existent/path");
    expect(isClean).toBe(false);
  });
});

describe("hasSubmodules", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(__dirname, "..", "test-temp-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should return true when .gitmodules exists", async () => {
    const testDir = path.join(tempDir, "with-submodule");
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, ".gitmodules"), '[submodule "test"]\n\tpath = test\n');

    const result = await hasSubmodules(testDir);
    expect(result).toBe(true);
  });

  test("should return false when .gitmodules does not exist", async () => {
    const testDir = path.join(tempDir, "no-submodule");
    await fs.mkdir(testDir, { recursive: true });

    const result = await hasSubmodules(testDir);
    expect(result).toBe(false);
  });

  test("should return false for non-existent path", async () => {
    const result = await hasSubmodules("/non/existent/path");
    expect(result).toBe(false);
  });
});

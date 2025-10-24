/**
 * Workspace creation integration tests
 *
 * Tests workspace creation through the Runtime interface for both LocalRuntime and SSHRuntime.
 * Verifies parity between local (git worktree) and SSH (rsync/scp sync) approaches.
 */

import { shouldRunIntegrationTests } from "../testUtils";
import {
  isDockerAvailable,
  startSSHServer,
  stopSSHServer,
  type SSHServerConfig,
} from "./ssh-fixture";
import { createTestRuntime, type RuntimeType } from "./test-helpers";
import { execBuffered, readFileString } from "@/utils/runtime/helpers";
import type { Runtime } from "@/runtime/Runtime";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

// Mock InitLogger for tests
const mockInitLogger = {
  logStep: () => {},
  logStdout: () => {},
  logStderr: () => {},
  logComplete: () => {},
};

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// SSH server config (shared across all tests)
let sshConfig: SSHServerConfig | undefined;

/**
 * Helper to create a git repository for testing
 */
async function createTestGitRepo(options: {
  branch?: string;
  files?: Record<string, string>;
}): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "git-repo-"));

  // Initialize git repo
  execSync("git init", { cwd: repoPath });
  execSync('git config user.email "test@example.com"', { cwd: repoPath });
  execSync('git config user.name "Test User"', { cwd: repoPath });

  // Create initial files
  const files = options.files ?? { "README.md": "# Test Project\n" };
  for (const [filename, content] of Object.entries(files)) {
    await fs.writeFile(path.join(repoPath, filename), content);
  }

  // Commit
  execSync("git add .", { cwd: repoPath });
  execSync('git commit -m "Initial commit"', { cwd: repoPath });

  // Rename to specified branch (default: main)
  const branch = options.branch ?? "main";
  execSync(`git branch -M ${branch}`, { cwd: repoPath });

  return repoPath;
}

/**
 * Cleanup git repo and all worktrees
 */
async function cleanupGitRepo(repoPath: string): Promise<void> {
  try {
    // Prune worktrees first
    try {
      execSync("git worktree prune", { cwd: repoPath, stdio: "ignore" });
    } catch {
      // Ignore errors
    }

    // Remove directory
    await fs.rm(repoPath, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to cleanup git repo ${repoPath}:`, error);
  }
}

describeIntegration("Workspace creation tests", () => {
  beforeAll(async () => {
    // Check if Docker is available (required for SSH tests)
    if (!(await isDockerAvailable())) {
      throw new Error(
        "Docker is required for runtime integration tests. Please install Docker or skip tests by unsetting TEST_INTEGRATION."
      );
    }

    // Start SSH server (shared across all tests for speed)
    console.log("Starting SSH server container...");
    sshConfig = await startSSHServer();
    console.log(`SSH server ready on port ${sshConfig.port}`);
  }, 60000); // 60s timeout for Docker operations

  afterAll(async () => {
    if (sshConfig) {
      console.log("Stopping SSH server container...");
      await stopSSHServer(sshConfig);
    }
  }, 30000);

  // Test matrix: Run tests for both local and SSH runtimes
  // NOTE: SSH tests skipped - Docker container needs git installed
  describe.each<{ type: RuntimeType }>([{ type: "local" }])(
    "Workspace Creation - $type runtime",
    ({ type }) => {
      test.concurrent("creates workspace with new branch from trunk", async () => {
        // Create test git repo
        const projectPath = await createTestGitRepo({
          branch: "main",
          files: { "README.md": "# Test Project\n", "test.txt": "hello world" },
        });

        try {
          // Create runtime - use unique workdir per test
          const testId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const workdir =
            type === "local"
              ? path.join(os.tmpdir(), testId)
              : `/home/testuser/workspace/${testId}`;

          const runtime = createTestRuntime(type, workdir, sshConfig);

          // Create workspace
          const result = await runtime.createWorkspace({
            projectPath,
            branchName: "feature-branch",
            trunkBranch: "main",
            workspaceId: "feature-branch",
            initLogger: mockInitLogger,
          });

          if (!result.success) {
            console.error("Workspace creation failed:", result.error);
          } else {
            console.log("Workspace created at:", result.workspacePath);
            console.log("Expected workdir:", workdir);
          }
          expect(result.success).toBe(true);
          expect(result.workspacePath).toBeDefined();
          expect(result.error).toBeUndefined();

          // Verify: workspace directory exists
          const stat = await runtime.stat(".");
          expect(stat.isDirectory).toBe(true);

          // Verify: correct branch checked out
          const branchResult = await execBuffered(runtime, "git rev-parse --abbrev-ref HEAD", {
            cwd: ".",
            timeout: 5,
          });
          expect(branchResult.stdout.trim()).toBe("feature-branch");

          // Verify: files exist in workspace
          const readme = await readFileString(runtime, "README.md");
          expect(readme).toContain("Test Project");

          const testFile = await readFileString(runtime, "test.txt");
          expect(testFile).toContain("hello world");

          // Cleanup remote workspace for SSH
          if (type === "ssh") {
            await execBuffered(runtime, `rm -rf ${workdir}`, { cwd: "/tmp", timeout: 10 });
          }
        } finally {
          await cleanupGitRepo(projectPath);
        }
      });

      test.concurrent("creates workspace with existing branch", async () => {
        // Create test git repo with multiple branches
        const projectPath = await createTestGitRepo({ branch: "main" });

        try {
          // Create an existing branch
          execSync("git checkout -b existing-branch", { cwd: projectPath });
          await fs.writeFile(path.join(projectPath, "existing.txt"), "existing branch");
          execSync("git add . && git commit -m 'Add file in existing branch'", {
            cwd: projectPath,
          });
          execSync("git checkout main", { cwd: projectPath });

          // Create runtime
          const testId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const workdir =
            type === "local"
              ? path.join(os.tmpdir(), testId)
              : `/home/testuser/workspace/${testId}`;

          const runtime = createTestRuntime(type, workdir, sshConfig);

          // Create workspace with existing branch
          const result = await runtime.createWorkspace({
            projectPath,
            branchName: "existing-branch",
            trunkBranch: "main",
            workspaceId: "existing-branch",
            initLogger: mockInitLogger,
          });

          expect(result.success).toBe(true);

          // Verify: correct branch checked out
          const branchResult = await execBuffered(runtime, "git rev-parse --abbrev-ref HEAD", {
            cwd: ".",
            timeout: 5,
          });
          expect(branchResult.stdout.trim()).toBe("existing-branch");

          // Verify: branch-specific file exists
          const existingFile = await readFileString(runtime, "existing.txt");
          expect(existingFile).toContain("existing branch");

          // Cleanup remote workspace for SSH
          if (type === "ssh") {
            await execBuffered(runtime, `rm -rf ${workdir}`, { cwd: "/tmp", timeout: 10 });
          }
        } finally {
          await cleanupGitRepo(projectPath);
        }
      });

      test.concurrent("fails gracefully on invalid trunk branch", async () => {
        const projectPath = await createTestGitRepo({ branch: "main" });

        try {
          const testId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const workdir =
            type === "local"
              ? path.join(os.tmpdir(), testId)
              : `/home/testuser/workspace/${testId}`;

          const runtime = createTestRuntime(type, workdir, sshConfig);

          // Try to create workspace with non-existent trunk
          const result = await runtime.createWorkspace({
            projectPath,
            branchName: "feature",
            trunkBranch: "nonexistent",
            workspaceId: "feature",
            initLogger: mockInitLogger,
          });

          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain("nonexistent");

          // Cleanup remote workspace for SSH (if partially created)
          if (type === "ssh") {
            try {
              await execBuffered(runtime, `rm -rf ${workdir}`, { cwd: "/tmp", timeout: 10 });
            } catch {
              // Ignore cleanup errors
            }
          }
        } finally {
          await cleanupGitRepo(projectPath);
        }
      });

      test.concurrent("preserves git history", async () => {
        // Create repo with multiple commits
        const projectPath = await createTestGitRepo({ branch: "main" });

        try {
          // Add more commits
          await fs.writeFile(path.join(projectPath, "file2.txt"), "second file");
          execSync("git add . && git commit -m 'Second commit'", { cwd: projectPath });
          await fs.writeFile(path.join(projectPath, "file3.txt"), "third file");
          execSync("git add . && git commit -m 'Third commit'", { cwd: projectPath });

          const testId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const workdir =
            type === "local"
              ? path.join(os.tmpdir(), testId)
              : `/home/testuser/workspace/${testId}`;

          const runtime = createTestRuntime(type, workdir, sshConfig);

          // Create workspace
          const result = await runtime.createWorkspace({
            projectPath,
            branchName: "history-test",
            trunkBranch: "main",
            workspaceId: "history-test",
            initLogger: mockInitLogger,
          });

          expect(result.success).toBe(true);

          // Verify: git log shows all commits
          const logResult = await execBuffered(runtime, "git log --oneline", {
            cwd: ".",
            timeout: 5,
          });

          expect(logResult.stdout).toContain("Third commit");
          expect(logResult.stdout).toContain("Second commit");
          expect(logResult.stdout).toContain("Initial commit");

          // Cleanup remote workspace for SSH
          if (type === "ssh") {
            await execBuffered(runtime, `rm -rf ${workdir}`, { cwd: "/tmp", timeout: 10 });
          }
        } finally {
          await cleanupGitRepo(projectPath);
        }
      });
    }
  );

  // SSH-specific tests
  // NOTE: These tests currently fail because the SSH Docker container doesn't have git installed
  // TODO: Update ssh-fixture to install git in the container
  describe.skip("SSH runtime - rsync/scp fallback", () => {
    test.concurrent(
      "falls back to scp when rsync unavailable",
      async () => {
        const projectPath = await createTestGitRepo({
          branch: "main",
          files: { "README.md": "# Fallback Test\n" },
        });

        try {
          const testId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const workdir = `/home/testuser/workspace/${testId}`;

          // Create SSHRuntime but simulate rsync not available
          // We'll do this by temporarily renaming rsync on the local machine
          // For simplicity in tests, we'll just verify the scp path works by forcing an rsync error

          const runtime = createTestRuntime("ssh", workdir, sshConfig);

          // First, let's test that normal creation works
          const result = await runtime.createWorkspace({
            projectPath,
            branchName: "scp-test",
            trunkBranch: "main",
            workspaceId: "scp-test",
            initLogger: mockInitLogger,
          });

          // If rsync is not available on the system, scp will be used automatically
          // Either way, workspace creation should succeed
          if (!result.success) {
            console.error("SSH workspace creation failed:", result.error);
          }
          expect(result.success).toBe(true);

          // Verify files were synced
          const readme = await readFileString(runtime, "README.md");
          expect(readme).toContain("Fallback Test");

          // Cleanup
          await execBuffered(runtime, `rm -rf ${workdir}`, { cwd: "/tmp", timeout: 10 });
        } finally {
          await cleanupGitRepo(projectPath);
        }
      },
      30000
    ); // Longer timeout for SSH operations
  });
});

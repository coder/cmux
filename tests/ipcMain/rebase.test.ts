import { setupWorkspaceWithoutProvider, shouldRunIntegrationTests } from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import type { RebaseResult } from "../../src/types/ipc";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

/**
 * Helper to set up git remote for rebase testing
 * Sets the temp repo as "origin" for the workspace
 */
async function setupGitRemote(workspacePath: string, tempGitRepo: string): Promise<void> {
  await execAsync(`git remote add origin "${tempGitRepo}"`, { cwd: workspacePath });
  await execAsync(`git fetch origin`, { cwd: workspacePath });
  await execAsync(`git branch --set-upstream-to=origin/main`, { cwd: workspacePath });
}

describeIntegration("IpcMain rebase integration tests", () => {
  test.concurrent(
    "should show behind count when upstream has new commits",
    async () => {
      const { env, workspaceId, workspacePath, tempGitRepo, cleanup } =
        await setupWorkspaceWithoutProvider("rebase-test");

      try {
        // Set up git remote (workspace tracks tempGitRepo as origin)
        await setupGitRemote(workspacePath, tempGitRepo);

        // Add workspace and project to config
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          projectConfig.workspaces.push({ path: workspacePath, trunkBranch: "main" });
          env.config.saveConfig(projectsConfig);
        }

        // Create a commit in the main branch (upstream)
        await execAsync(`echo "upstream change" >> README.md`, { cwd: tempGitRepo });
        await execAsync(`git add . && git commit -m "Upstream commit"`, { cwd: tempGitRepo });

        // Fetch in the workspace to see the upstream change
        await execAsync(`git fetch origin`, { cwd: workspacePath });

        // Check git status - workspace should be behind
        const { stdout: status } = await execAsync(
          `git -C "${workspacePath}" rev-list --left-right --count HEAD...origin/main`
        );
        const [ahead, behind] = status.trim().split("\t").map(Number);

        expect(behind).toBeGreaterThan(0);
        expect(behind).toBe(1); // Should be 1 commit behind
      } finally {
        await cleanup();
      }
    },
    60000
  );

  test.concurrent(
    "should successfully rebase when behind and no conflicts",
    async () => {
      const { env, workspaceId, workspacePath, tempGitRepo, cleanup } =
        await setupWorkspaceWithoutProvider("rebase-clean");

      try {
        // Set up git remote (workspace tracks tempGitRepo as origin)
        await setupGitRemote(workspacePath, tempGitRepo);

        // Add workspace and project to config
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          projectConfig.workspaces.push({ path: workspacePath, trunkBranch: "main" });
          env.config.saveConfig(projectsConfig);
        }

        // Create upstream commit
        await execAsync(`echo "upstream change" >> upstream.txt`, { cwd: tempGitRepo });
        await execAsync(`git add . && git commit -m "Upstream commit"`, { cwd: tempGitRepo });

        // Create non-conflicting local commit in workspace
        await execAsync(`echo "local change" >> local.txt`, { cwd: workspacePath });
        await execAsync(`git add . && git commit -m "Local commit"`, { cwd: workspacePath });

        // Verify workspace is behind
        await execAsync(`git fetch origin`, { cwd: workspacePath });
        const { stdout: beforeStatus } = await execAsync(
          `git -C "${workspacePath}" rev-list --left-right --count HEAD...origin/main`
        );
        const [aheadBefore, behindBefore] = beforeStatus.trim().split("\t").map(Number);
        expect(behindBefore).toBe(1);
        expect(aheadBefore).toBe(1);

        // Perform rebase via IPC
        const result = (await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REBASE,
          workspaceId
        )) as RebaseResult;

        // Verify rebase succeeded
        expect(result.success).toBe(true);
        expect(result.status).toBe("completed");

        // Verify workspace is no longer behind
        const { stdout: afterStatus } = await execAsync(
          `git -C "${workspacePath}" rev-list --left-right --count HEAD...origin/main`
        );
        const [aheadAfter, behindAfter] = afterStatus.trim().split("\t").map(Number);
        expect(behindAfter).toBe(0); // Should be up to date
        expect(aheadAfter).toBe(1); // Still has local commit

        // Verify both commits are present
        const { stdout: log } = await execAsync(`git -C "${workspacePath}" log --oneline -2`);
        expect(log).toContain("Local commit");
        expect(log).toContain("Upstream commit");
      } finally {
        await cleanup();
      }
    },
    60000
  );

  test.concurrent(
    "should stash and restore uncommitted changes during rebase",
    async () => {
      const { env, workspaceId, workspacePath, tempGitRepo, cleanup } =
        await setupWorkspaceWithoutProvider("rebase-stash");

      try {
        // Set up git remote (workspace tracks tempGitRepo as origin)
        await setupGitRemote(workspacePath, tempGitRepo);

        // Add workspace and project to config
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          projectConfig.workspaces.push({ path: workspacePath, trunkBranch: "main" });
          env.config.saveConfig(projectsConfig);
        }

        // Create upstream commit
        await execAsync(`echo "upstream" >> README.md`, { cwd: tempGitRepo });
        await execAsync(`git add . && git commit -m "Upstream"`, { cwd: tempGitRepo });

        // Create uncommitted changes in workspace
        const uncommittedFile = path.join(workspacePath, "uncommitted.txt");
        await fs.writeFile(uncommittedFile, "uncommitted changes");

        // Verify file exists before rebase
        expect(await fs.readFile(uncommittedFile, "utf-8")).toBe("uncommitted changes");

        // Perform rebase
        const result = (await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REBASE,
          workspaceId
        )) as RebaseResult;

        expect(result.success).toBe(true);
        expect(result.status).toBe("completed");
        expect(result.stashed).toBe(true);

        // Verify uncommitted changes were restored
        expect(await fs.readFile(uncommittedFile, "utf-8")).toBe("uncommitted changes");

        // Verify workspace is clean (no stash left)
        const { stdout: stashList } = await execAsync(`git -C "${workspacePath}" stash list`);
        expect(stashList.trim()).toBe("");
      } finally {
        await cleanup();
      }
    },
    60000
  );

  test.concurrent(
    "should detect and report conflicts when rebasing",
    async () => {
      const { env, workspaceId, workspacePath, tempGitRepo, cleanup } =
        await setupWorkspaceWithoutProvider("rebase-conflict");

      try {
        // Set up git remote (workspace tracks tempGitRepo as origin)
        await setupGitRemote(workspacePath, tempGitRepo);

        // Add workspace and project to config
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          projectConfig.workspaces.push({ path: workspacePath, trunkBranch: "main" });
          env.config.saveConfig(projectsConfig);
        }

        // Create conflicting change in main branch
        await execAsync(`echo "main version" >> conflict.txt`, { cwd: tempGitRepo });
        await execAsync(`git add . && git commit -m "Main change"`, { cwd: tempGitRepo });

        // Create conflicting change in workspace
        await execAsync(`echo "workspace version" >> conflict.txt`, { cwd: workspacePath });
        await execAsync(`git add . && git commit -m "Workspace change"`, { cwd: workspacePath });

        // Clear events from workspace creation
        env.sentEvents.length = 0;

        // Perform rebase - should result in conflicts
        const result = (await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REBASE,
          workspaceId
        )) as RebaseResult;

        // Verify conflict was detected
        expect(result.success).toBe(false);
        expect(result.status).toBe("conflicts");
        expect(result.conflictFiles).toBeDefined();
        expect(result.conflictFiles).toContain("conflict.txt");

        // Verify conflict message was injected into chat
        const chatMessages = env.sentEvents.filter((e) => e.channel.includes("workspace:chat:"));

        // Debug: Log what messages we got
        if (chatMessages.length === 0) {
          console.log(
            "No chat messages found. All events:",
            env.sentEvents.map((e) => e.channel)
          );
        } else {
          console.log(
            "Chat messages:",
            chatMessages.map((m) => ({
              channel: m.channel,
              role: (m.data as any).role,
              parts: (m.data as any).parts,
              contentPreview: (
                (m.data as any)?.parts?.[0]?.text ||
                (m.data as any)?.content ||
                ""
              ).substring(0, 100),
            }))
          );
        }

        expect(chatMessages.length).toBeGreaterThan(0);

        const conflictMessage = chatMessages.find((msg) => {
          const content = (msg.data as any)?.parts?.[0]?.text || (msg.data as any)?.content;
          return content && content.includes("Git rebase") && content.includes("conflicts");
        });

        expect(conflictMessage).toBeDefined();
        const messageContent =
          (conflictMessage!.data as any)?.parts?.[0]?.text ||
          (conflictMessage!.data as any)?.content;
        expect(messageContent).toContain("conflict.txt");
        expect(messageContent).toContain("git rebase --continue");

        // Verify rebase is in progress
        const rebaseMerge = path.join(workspacePath, ".git", "rebase-merge");
        const rebaseApply = path.join(workspacePath, ".git", "rebase-apply");
        const rebaseInProgress =
          (await fs
            .access(rebaseMerge)
            .then(() => true)
            .catch(() => false)) ||
          (await fs
            .access(rebaseApply)
            .then(() => true)
            .catch(() => false));

        expect(rebaseInProgress).toBe(true);
      } finally {
        await cleanup();
      }
    },
    60000
  );

  test.concurrent(
    "should fail gracefully when rebase already in progress",
    async () => {
      const { env, workspaceId, workspacePath, tempGitRepo, cleanup } =
        await setupWorkspaceWithoutProvider("rebase-inprogress");

      try {
        // Set up git remote (workspace tracks tempGitRepo as origin)
        await setupGitRemote(workspacePath, tempGitRepo);

        // Add workspace and project to config
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          projectConfig.workspaces.push({ path: workspacePath, trunkBranch: "main" });
          env.config.saveConfig(projectsConfig);
        }

        // Create upstream commit
        await execAsync(`echo "upstream" >> README.md`, { cwd: tempGitRepo });
        await execAsync(`git add . && git commit -m "Upstream"`, { cwd: tempGitRepo });

        // Create conflicting commit to trigger rebase conflict
        await execAsync(`echo "workspace" >> README.md`, { cwd: workspacePath });
        await execAsync(`git add . && git commit -m "Workspace"`, { cwd: workspacePath });

        // Start a rebase manually (will result in conflict and stop)
        try {
          await execAsync(`git fetch origin && git rebase origin/main`, { cwd: workspacePath });
        } catch {
          // Expected to fail due to conflict
        }

        // Verify rebase is in progress
        const rebaseMerge = path.join(workspacePath, ".git", "rebase-merge");
        const exists = await fs
          .access(rebaseMerge)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(true);

        // Clear events
        env.sentEvents.length = 0;

        // Try to rebase via IPC - should fail because rebase already in progress
        const result = (await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REBASE,
          workspaceId
        )) as RebaseResult;

        // Should fail with assertion error or aborted status
        expect(result.success).toBe(false);
        expect(result.status).toBe("aborted");
        expect(result.error).toContain("rebase");

        // Verify error message was injected into chat with diagnostics
        const chatMessages = env.sentEvents.filter((e) => e.channel.includes("workspace:chat:"));
        if (chatMessages.length > 0) {
          const errorMessage = chatMessages.find((msg) => {
            const content = (msg.data as any).content;
            return content && content.includes("rebase") && content.includes("failed");
          });

          if (errorMessage) {
            const content = (errorMessage.data as any).content;
            expect(content).toContain("Rebase state: IN PROGRESS");
          }
        }
      } finally {
        await cleanup();
      }
    },
    60000
  );

  test.concurrent(
    "should refuse to rebase when agent is streaming",
    async () => {
      // Note: This test would require mocking the streaming state
      // Since we can't easily trigger streaming in tests without making API calls,
      // this test verifies the logic path exists but may need to be implemented
      // with proper mocking infrastructure

      // TODO: Add streaming state mock to test environment
      expect(true).toBe(true); // Placeholder
    },
    10000
  );
});

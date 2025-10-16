import { shouldRunIntegrationTests, createTestEnvironment, cleanupTestEnvironment } from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import { generateBranchName, createWorkspace } from "./helpers";
import type { WorkspaceMetaEvent } from "../../src/types/workspace";
import * as path from "path";
import * as os from "os";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

/**
 * Create a temp git repo with a .cmux/init hook that writes to stdout/stderr and exits with a given code
 */
async function createTempGitRepoWithInitHook(options: {
  exitCode: number;
  stdoutLines?: string[];
  stderrLines?: string[];
}): Promise<string> {
  const fs = await import("fs/promises");
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  // Use mkdtemp to avoid race conditions
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-test-init-hook-"));

  // Initialize git repo
  await execAsync(`git init`, { cwd: tempDir });
  await execAsync(`git config user.email "test@example.com" && git config user.name "Test User"`, {
    cwd: tempDir,
  });
  await execAsync(`echo "test" > README.md && git add . && git commit -m "Initial commit"`, {
    cwd: tempDir,
  });

  // Create .cmux directory
  const cmuxDir = path.join(tempDir, ".cmux");
  await fs.mkdir(cmuxDir, { recursive: true });

  // Create init hook script
  const hookPath = path.join(cmuxDir, "init");
  const stdoutCmds = (options.stdoutLines ?? []).map((line) => `echo "${line}"`).join("\n");
  const stderrCmds = (options.stderrLines ?? []).map((line) => `echo "${line}" >&2`).join("\n");

  const scriptContent = `#!/usr/bin/env bash
${stdoutCmds}
${stderrCmds}
exit ${options.exitCode}
`;

  await fs.writeFile(hookPath, scriptContent, { mode: 0o755 });

  return tempDir;
}

/**
 * Cleanup temporary git repository
 */
async function cleanupTempGitRepo(repoPath: string): Promise<void> {
  const fs = await import("fs/promises");
  const maxRetries = 3;
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
      }
    }
  }
  console.warn(`Failed to cleanup temp git repo after ${maxRetries} attempts:`, lastError);
}

describeIntegration("IpcMain workspace init hook integration tests", () => {
  test.concurrent(
    "should stream init hook output and allow workspace usage on hook success",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepoWithInitHook({
        exitCode: 0,
        stdoutLines: ["Installing dependencies...", "Build complete!"],
        stderrLines: ["Warning: deprecated package"],
      });

      try {
        const branchName = generateBranchName("init-hook-success");

        // Create workspace (which will trigger the hook)
        const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, branchName);
        expect(createResult.success).toBe(true);
        if (!createResult.success) return;

        const workspaceId = createResult.metadata.id;

        // Wait for hook to complete by polling sentEvents
        const deadline = Date.now() + 10000;
        let metaEvents: WorkspaceMetaEvent[] = [];
        while (Date.now() < deadline) {
          // Filter sentEvents for this workspace's meta events
          metaEvents = env.sentEvents
            .filter(
              (e) =>
                e.channel === IPC_CHANNELS.WORKSPACE_STREAM_META &&
                (e.data as WorkspaceMetaEvent).workspaceId === workspaceId
            )
            .map((e) => e.data as WorkspaceMetaEvent);

          // Check if we have the end event
          const hasEnd = metaEvents.some((e) => e.type === "workspace-init-end");
          if (hasEnd) break;

          // Wait a bit before checking again
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Verify we got the end event
        const successEndEvent = metaEvents.find((e) => e.type === "workspace-init-end");
        if (!successEndEvent) {
          throw new Error("Hook did not complete in time");
        }

        // Verify event sequence
        expect(metaEvents.length).toBeGreaterThan(0);

        // First event should be start
        const startEvent = metaEvents.find((e) => e.type === "workspace-init-start");
        expect(startEvent).toBeDefined();
        expect(startEvent?.workspaceId).toBe(workspaceId);

        // Should have output and error lines
        const outputEvents = metaEvents.filter(
          (e) => e.type === "workspace-init-output"
        ) as Extract<WorkspaceMetaEvent, { type: "workspace-init-output" }>[];
        const errorEvents = metaEvents.filter((e) => e.type === "workspace-init-error") as Extract<
          WorkspaceMetaEvent,
          { type: "workspace-init-error" }
        >[];

        expect(outputEvents.length).toBe(2);
        expect(outputEvents[0].line).toBe("Installing dependencies...");
        expect(outputEvents[1].line).toBe("Build complete!");

        expect(errorEvents.length).toBe(1);
        expect(errorEvents[0].line).toBe("Warning: deprecated package");

        // Last event should be end with exitCode 0
        const finalEvent = metaEvents[metaEvents.length - 1];
        expect(finalEvent.type).toBe("workspace-init-end");
        expect(
          (finalEvent as Extract<WorkspaceMetaEvent, { type: "workspace-init-end" }>).exitCode
        ).toBe(0);

        // Workspace should be usable - verify getInfo succeeds
        const info = await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_INFO, workspaceId);
        expect(info).not.toBeNull();
        expect(info.id).toBe(workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should stream init hook output and allow workspace usage on hook failure",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepoWithInitHook({
        exitCode: 1,
        stdoutLines: ["Starting setup..."],
        stderrLines: ["ERROR: Failed to install dependencies"],
      });

      try {
        const branchName = generateBranchName("init-hook-failure");

        // Create workspace
        const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, branchName);
        expect(createResult.success).toBe(true);
        if (!createResult.success) return;

        const workspaceId = createResult.metadata.id;

        // Wait for hook to complete by polling sentEvents
        const deadline = Date.now() + 10000;
        let metaEvents: WorkspaceMetaEvent[] = [];
        while (Date.now() < deadline) {
          metaEvents = env.sentEvents
            .filter(
              (e) =>
                e.channel === IPC_CHANNELS.WORKSPACE_STREAM_META &&
                (e.data as WorkspaceMetaEvent).workspaceId === workspaceId
            )
            .map((e) => e.data as WorkspaceMetaEvent);

          const hasEnd = metaEvents.some((e) => e.type === "workspace-init-end");
          if (hasEnd) break;

          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const failureEndEvent = metaEvents.find((e) => e.type === "workspace-init-end");
        if (!failureEndEvent) {
          throw new Error("Hook did not complete in time");
        }

        // Verify we got events
        expect(metaEvents.length).toBeGreaterThan(0);

        // Should have start event
        const failureStartEvent = metaEvents.find((e) => e.type === "workspace-init-start");
        expect(failureStartEvent).toBeDefined();

        // Should have output and error
        const failureOutputEvents = metaEvents.filter((e) => e.type === "workspace-init-output");
        const failureErrorEvents = metaEvents.filter((e) => e.type === "workspace-init-error");
        expect(failureOutputEvents.length).toBeGreaterThanOrEqual(1);
        expect(failureErrorEvents.length).toBeGreaterThanOrEqual(1);

        // Last event should be end with exitCode 1
        const failureFinalEvent = metaEvents[metaEvents.length - 1];
        expect(failureFinalEvent.type).toBe("workspace-init-end");
        expect(
          (failureFinalEvent as Extract<WorkspaceMetaEvent, { type: "workspace-init-end" }>)
            .exitCode
        ).toBe(1);

        // CRITICAL: Workspace should remain usable even after hook failure
        const info = await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_INFO, workspaceId);
        expect(info).not.toBeNull();
        expect(info.id).toBe(workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should not emit meta events when no init hook exists",
    async () => {
      const env = await createTestEnvironment();
      // Create repo without .cmux/init hook
      const fs = await import("fs/promises");
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-test-no-hook-"));

      try {
        // Initialize git repo without hook
        await execAsync(`git init`, { cwd: tempDir });
        await execAsync(
          `git config user.email "test@example.com" && git config user.name "Test User"`,
          { cwd: tempDir }
        );
        await execAsync(`echo "test" > README.md && git add . && git commit -m "Initial commit"`, {
          cwd: tempDir,
        });

        const branchName = generateBranchName("no-hook");

        // Track meta events
        const metaEvents: WorkspaceMetaEvent[] = [];
        env.mockIpcRenderer.on(IPC_CHANNELS.WORKSPACE_STREAM_META, (_event, data) => {
          metaEvents.push(data);
        });

        // Create workspace
        const createResult = await createWorkspace(env.mockIpcRenderer, tempDir, branchName);
        expect(createResult.success).toBe(true);
        if (!createResult.success) return;

        // Wait a bit to ensure no events are emitted
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Should have no meta events
        expect(metaEvents.length).toBe(0);

        // Workspace should still be usable
        const info = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          createResult.metadata.id
        );
        expect(info).not.toBeNull();
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempDir);
      }
    },
    15000
  );
});

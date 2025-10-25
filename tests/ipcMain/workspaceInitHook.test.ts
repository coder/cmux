import { shouldRunIntegrationTests, createTestEnvironment, cleanupTestEnvironment } from "./setup";
import { IPC_CHANNELS, getChatChannel } from "../../src/constants/ipc-constants";
import { generateBranchName, createWorkspace } from "./helpers";
import type { WorkspaceChatMessage, WorkspaceInitEvent } from "../../src/types/ipc";
import { isInitStart, isInitOutput, isInitEnd } from "../../src/types/ipc";
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
  sleepBetweenLines?: number; // milliseconds
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
  const sleepCmd = options.sleepBetweenLines ? `sleep ${options.sleepBetweenLines / 1000}` : "";

  const stdoutCmds = (options.stdoutLines ?? [])
    .map((line, idx) => {
      const needsSleep = sleepCmd && idx < (options.stdoutLines?.length ?? 0) - 1;
      return `echo "${line}"${needsSleep ? `\n${sleepCmd}` : ""}`;
    })
    .join("\n");

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
        let initEvents: WorkspaceInitEvent[] = [];
        while (Date.now() < deadline) {
          // Filter sentEvents for this workspace's init events on chat channel
          initEvents = env.sentEvents
            .filter((e) => e.channel === getChatChannel(workspaceId))
            .map((e) => e.data as WorkspaceChatMessage)
            .filter(
              (msg) => isInitStart(msg) || isInitOutput(msg) || isInitEnd(msg)
            ) as WorkspaceInitEvent[];

          // Check if we have the end event
          const hasEnd = initEvents.some((e) => isInitEnd(e));
          if (hasEnd) break;

          // Wait a bit before checking again
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Verify we got the end event
        const successEndEvent = initEvents.find((e) => isInitEnd(e));
        if (!successEndEvent) {
          throw new Error("Hook did not complete in time");
        }

        // Verify event sequence
        expect(initEvents.length).toBeGreaterThan(0);

        // First event should be start
        const startEvent = initEvents.find((e) => isInitStart(e));
        expect(startEvent).toBeDefined();
        if (startEvent && isInitStart(startEvent)) {
          // Hook path should be the project path (where .cmux/init exists)
          expect(startEvent.hookPath).toBeTruthy();
        }

        // Should have output and error lines
        const outputEvents = initEvents.filter((e) => isInitOutput(e) && !e.isError) as Extract<
          WorkspaceInitEvent,
          { type: "init-output" }
        >[];
        const errorEvents = initEvents.filter((e) => isInitOutput(e) && e.isError) as Extract<
          WorkspaceInitEvent,
          { type: "init-output" }
        >[];

        // Should have workspace creation logs + hook output
        expect(outputEvents.length).toBeGreaterThanOrEqual(2);

        // Verify hook output is present (may have workspace creation logs before it)
        const outputLines = outputEvents.map((e) => e.line);
        expect(outputLines).toContain("Installing dependencies...");
        expect(outputLines).toContain("Build complete!");

        expect(errorEvents.length).toBe(1);
        expect(errorEvents[0].line).toBe("Warning: deprecated package");

        // Last event should be end with exitCode 0
        const finalEvent = initEvents[initEvents.length - 1];
        expect(isInitEnd(finalEvent)).toBe(true);
        if (isInitEnd(finalEvent)) {
          expect(finalEvent.exitCode).toBe(0);
        }

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
        let initEvents: WorkspaceInitEvent[] = [];
        while (Date.now() < deadline) {
          initEvents = env.sentEvents
            .filter((e) => e.channel === getChatChannel(workspaceId))
            .map((e) => e.data as WorkspaceChatMessage)
            .filter(
              (msg) => isInitStart(msg) || isInitOutput(msg) || isInitEnd(msg)
            ) as WorkspaceInitEvent[];

          const hasEnd = initEvents.some((e) => isInitEnd(e));
          if (hasEnd) break;

          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const failureEndEvent = initEvents.find((e) => isInitEnd(e));
        if (!failureEndEvent) {
          throw new Error("Hook did not complete in time");
        }

        // Verify we got events
        expect(initEvents.length).toBeGreaterThan(0);

        // Should have start event
        const failureStartEvent = initEvents.find((e) => isInitStart(e));
        expect(failureStartEvent).toBeDefined();

        // Should have output and error
        const failureOutputEvents = initEvents.filter((e) => isInitOutput(e) && !e.isError);
        const failureErrorEvents = initEvents.filter((e) => isInitOutput(e) && e.isError);
        expect(failureOutputEvents.length).toBeGreaterThanOrEqual(1);
        expect(failureErrorEvents.length).toBeGreaterThanOrEqual(1);

        // Last event should be end with exitCode 1
        const failureFinalEvent = initEvents[initEvents.length - 1];
        expect(isInitEnd(failureFinalEvent)).toBe(true);
        if (isInitEnd(failureFinalEvent)) {
          expect(failureFinalEvent.exitCode).toBe(1);
        }

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

        // Create workspace
        const createResult = await createWorkspace(env.mockIpcRenderer, tempDir, branchName);
        expect(createResult.success).toBe(true);
        if (!createResult.success) return;

        const workspaceId = createResult.metadata.id;

        // Wait a bit to ensure no events are emitted
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Verify init events were sent (workspace creation logs even without hook)
        const initEvents = env.sentEvents
          .filter((e) => e.channel === getChatChannel(workspaceId))
          .map((e) => e.data as WorkspaceChatMessage)
          .filter((msg) => isInitStart(msg) || isInitOutput(msg) || isInitEnd(msg));

        // Should have init-start event (always emitted, even without hook)
        const startEvent = initEvents.find((e) => isInitStart(e));
        expect(startEvent).toBeDefined();

        // Should have workspace creation logs (e.g., "Creating git worktree...")
        const outputEvents = initEvents.filter((e) => isInitOutput(e));
        expect(outputEvents.length).toBeGreaterThan(0);

        // Should have completion event with exit code 0 (success, no hook)
        const endEvent = initEvents.find((e) => isInitEnd(e));
        expect(endEvent).toBeDefined();
        if (endEvent && isInitEnd(endEvent)) {
          expect(endEvent.exitCode).toBe(0);
        }

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

  test.concurrent(
    "should persist init state to disk for replay across page reloads",
    async () => {
      const env = await createTestEnvironment();
      const fs = await import("fs/promises");
      const repoPath = await createTempGitRepoWithInitHook({
        exitCode: 0,
        stdoutLines: ["Installing dependencies", "Done!"],
        stderrLines: [],
      });

      try {
        const branchName = generateBranchName("replay-test");
        const createResult = await createWorkspace(env.mockIpcRenderer, repoPath, branchName);
        expect(createResult.success).toBe(true);
        if (!createResult.success) return;

        const workspaceId = createResult.metadata.id;

        // Wait for init hook to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify init-status.json exists on disk
        const initStatusPath = path.join(env.config.getSessionDir(workspaceId), "init-status.json");
        const statusExists = await fs
          .access(initStatusPath)
          .then(() => true)
          .catch(() => false);
        expect(statusExists).toBe(true);

        // Read and verify persisted state
        const statusContent = await fs.readFile(initStatusPath, "utf-8");
        const status = JSON.parse(statusContent);
        expect(status.status).toBe("success");
        expect(status.exitCode).toBe(0);

        // Should include workspace creation logs + hook output
        expect(status.lines).toEqual(
          expect.arrayContaining([
            { line: "Creating git worktree...", isError: false, timestamp: expect.any(Number) },
            {
              line: "Worktree created successfully",
              isError: false,
              timestamp: expect.any(Number),
            },
            expect.objectContaining({
              line: expect.stringMatching(/Running init hook:/),
              isError: false,
            }),
            { line: "Installing dependencies", isError: false, timestamp: expect.any(Number) },
            { line: "Done!", isError: false, timestamp: expect.any(Number) },
          ])
        );
        expect(status.hookPath).toBeTruthy(); // Project path where hook exists
        expect(status.startTime).toBeGreaterThan(0);
        expect(status.endTime).toBeGreaterThan(status.startTime);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(repoPath);
      }
    },
    15000
  );
});

test.concurrent(
  "should receive init events with natural timing (not batched)",
  async () => {
    const env = await createTestEnvironment();

    // Create project with slow init hook (100ms sleep between lines)
    const tempGitRepo = await createTempGitRepoWithInitHook({
      exitCode: 0,
      stdoutLines: ["Line 1", "Line 2", "Line 3", "Line 4"],
      sleepBetweenLines: 100, // 100ms between each echo
    });

    try {
      const branchName = generateBranchName("timing-test");
      const startTime = Date.now();

      // Create workspace - init hook will start immediately
      const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, branchName);
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      const workspaceId = createResult.metadata.id;

      // Wait for all init events to arrive
      const deadline = Date.now() + 10000;
      let initOutputEvents: Array<{ timestamp: number; line: string }> = [];

      while (Date.now() < deadline) {
        const currentEvents = env.sentEvents
          .filter((e) => e.channel === getChatChannel(workspaceId))
          .filter((e) => isInitOutput(e.data as WorkspaceChatMessage));

        initOutputEvents = currentEvents.map((e) => ({
          timestamp: e.timestamp, // Use timestamp from when event was sent
          line: (e.data as { line: string }).line,
        }));

        if (initOutputEvents.length >= 4) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect(initOutputEvents.length).toBe(4);

      // Calculate time between consecutive events
      const timeDiffs = initOutputEvents
        .slice(1)
        .map((event, i) => event.timestamp - initOutputEvents[i].timestamp);

      // ASSERTION: If streaming in real-time, events should be ~100ms apart
      // If batched/replayed, events will be <10ms apart
      const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;

      // Real-time streaming: expect at least 70ms average (accounting for variance)
      // Batched replay: would be <10ms
      expect(avgTimeDiff).toBeGreaterThan(70);

      // Also verify first event arrives early (not waiting for hook to complete)
      const firstEventDelay = initOutputEvents[0].timestamp - startTime;
      expect(firstEventDelay).toBeLessThan(1000); // Should arrive reasonably quickly (bash startup + git worktree setup)
    } finally {
      await cleanupTestEnvironment(env);
      await cleanupTempGitRepo(tempGitRepo);
    }
  },
  15000
);

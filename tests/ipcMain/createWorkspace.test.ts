/**
 * Integration tests for WORKSPACE_CREATE IPC handler
 *
 * Tests both LocalRuntime and SSHRuntime without mocking to verify:
 * - Workspace creation mechanics (git worktree, directory structure)
 * - Branch handling (new vs existing branches)
 * - Init hook execution with logging
 * - Parity between runtime implementations
 *
 * Uses real IPC handlers, real git operations, and Docker SSH server.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { shouldRunIntegrationTests, createTestEnvironment, cleanupTestEnvironment } from "./setup";
import type { TestEnvironment } from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import { createTempGitRepo, cleanupTempGitRepo, generateBranchName } from "./helpers";
import { detectDefaultTrunkBranch } from "../../src/git";
import {
  isDockerAvailable,
  startSSHServer,
  stopSSHServer,
  type SSHServerConfig,
} from "../runtime/ssh-fixture";
import type { RuntimeConfig } from "../../src/types/runtime";
import type { FrontendWorkspaceMetadata } from "../../src/types/workspace";

const execAsync = promisify(exec);

// Test constants
const TEST_TIMEOUT_MS = 60000;
const INIT_HOOK_WAIT_MS = 1500; // Wait for async init hook completion (local runtime)
const SSH_INIT_WAIT_MS = 7000; // SSH init includes sync + checkout + hook, takes longer
const CMUX_DIR = ".cmux";
const INIT_HOOK_FILENAME = "init";

// Event type constants
const EVENT_PREFIX_WORKSPACE_CHAT = "workspace:chat:";
const EVENT_TYPE_PREFIX_INIT = "init-";
const EVENT_TYPE_INIT_OUTPUT = "init-output";
const EVENT_TYPE_INIT_END = "init-end";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// SSH server config (shared across all SSH tests)
let sshConfig: SSHServerConfig | undefined;

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Type guard to check if an event is an init event with a type field
 */
function isInitEvent(data: unknown): data is { type: string } {
  return (
    data !== null &&
    typeof data === "object" &&
    "type" in data &&
    typeof (data as { type: unknown }).type === "string" &&
    (data as { type: string }).type.startsWith(EVENT_TYPE_PREFIX_INIT)
  );
}

/**
 * Filter events by type
 */
function filterEventsByType(
  events: Array<{ channel: string; data: unknown }>,
  eventType: string
): Array<{ channel: string; data: { type: string } }> {
  return events.filter((e) => isInitEvent(e.data) && e.data.type === eventType) as Array<{
    channel: string;
    data: { type: string };
  }>;
}

/**
 * Set up event capture for init events on workspace chat channel
 * Returns array that will be populated with captured events
 */
function setupInitEventCapture(env: TestEnvironment): Array<{ channel: string; data: unknown }> {
  const capturedEvents: Array<{ channel: string; data: unknown }> = [];
  const originalSend = env.mockWindow.webContents.send;

  env.mockWindow.webContents.send = ((channel: string, data: unknown) => {
    if (channel.startsWith(EVENT_PREFIX_WORKSPACE_CHAT) && isInitEvent(data)) {
      capturedEvents.push({ channel, data });
    }
    originalSend.call(env.mockWindow.webContents, channel, data);
  }) as typeof originalSend;

  return capturedEvents;
}

/**
 * Create init hook file in git repo
 */
async function createInitHook(repoPath: string, hookContent: string): Promise<void> {
  const cmuxDir = path.join(repoPath, CMUX_DIR);
  await fs.mkdir(cmuxDir, { recursive: true });
  const initHookPath = path.join(cmuxDir, INIT_HOOK_FILENAME);
  await fs.writeFile(initHookPath, hookContent, { mode: 0o755 });
}

/**
 * Commit changes in git repo
 */
async function commitChanges(repoPath: string, message: string): Promise<void> {
  await execAsync(`git add -A && git commit -m "${message}"`, {
    cwd: repoPath,
  });
}

/**
 * Create workspace and handle cleanup on test failure
 * Returns result and cleanup function
 */
async function createWorkspaceWithCleanup(
  env: TestEnvironment,
  projectPath: string,
  branchName: string,
  trunkBranch: string,
  runtimeConfig?: RuntimeConfig
): Promise<{
  result:
    | { success: true; metadata: FrontendWorkspaceMetadata }
    | { success: false; error: string };
  cleanup: () => Promise<void>;
}> {
  const result = await env.mockIpcRenderer.invoke(
    IPC_CHANNELS.WORKSPACE_CREATE,
    projectPath,
    branchName,
    trunkBranch,
    runtimeConfig
  );

  const cleanup = async () => {
    if (result.success) {
      await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, result.metadata.id);
    }
  };

  return { result, cleanup };
}

describeIntegration("WORKSPACE_CREATE with both runtimes", () => {
  beforeAll(async () => {
    // Check if Docker is available (required for SSH tests)
    if (!(await isDockerAvailable())) {
      throw new Error(
        "Docker is required for SSH runtime tests. Please install Docker or skip tests by unsetting TEST_INTEGRATION."
      );
    }

    // Start SSH server (shared across all tests for speed)
    console.log("Starting SSH server container for createWorkspace tests...");
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
  describe.each<{ type: "local" | "ssh" }>([{ type: "local" }, { type: "ssh" }])(
    "Runtime: $type",
    ({ type }) => {
      // Helper to build runtime config
      const getRuntimeConfig = (branchName: string): RuntimeConfig | undefined => {
        if (type === "ssh" && sshConfig) {
          return {
            type: "ssh",
            host: `testuser@localhost`,
            workdir: `${sshConfig.workdir}/${branchName}`,
            identityFile: sshConfig.privateKeyPath,
            port: sshConfig.port,
          };
        }
        return undefined; // undefined = defaults to local
      };

      // Get runtime-specific init wait time (SSH needs more time for rsync)
      const getInitWaitTime = () => (type === "ssh" ? SSH_INIT_WAIT_MS : INIT_HOOK_WAIT_MS);

      describe("Branch handling", () => {
        test.concurrent(
          "creates new branch from trunk when branch doesn't exist",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              const branchName = generateBranchName("new-branch");
              const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
              const runtimeConfig = getRuntimeConfig(branchName);

              const { result, cleanup } = await createWorkspaceWithCleanup(
                env,
                tempGitRepo,
                branchName,
                trunkBranch,
                runtimeConfig
              );

              expect(result.success).toBe(true);
              if (!result.success) {
                throw new Error(
                  `Failed to create workspace for new branch '${branchName}': ${result.error}`
                );
              }

              // Verify workspace metadata
              expect(result.metadata.id).toBeDefined();
              expect(result.metadata.namedWorkspacePath).toBeDefined();
              expect(result.metadata.projectName).toBeDefined();

              await cleanup();
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          TEST_TIMEOUT_MS
        );

        test.concurrent(
          "checks out existing branch when branch already exists",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              // Use existing "test-branch" created by createTempGitRepo
              const branchName = "test-branch";
              const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
              const runtimeConfig = getRuntimeConfig(branchName);

              const { result, cleanup } = await createWorkspaceWithCleanup(
                env,
                tempGitRepo,
                branchName,
                trunkBranch,
                runtimeConfig
              );

              expect(result.success).toBe(true);
              if (!result.success) {
                throw new Error(
                  `Failed to check out existing branch '${branchName}': ${result.error}`
                );
              }

              expect(result.metadata.id).toBeDefined();

              await cleanup();
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          TEST_TIMEOUT_MS
        );
      });

      describe("Init hook execution", () => {
        test.concurrent(
          "executes .cmux/init hook when present and streams logs",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              // Create and commit init hook
              await createInitHook(
                tempGitRepo,
                `#!/bin/bash
echo "Init hook started"
echo "Installing dependencies..."
sleep 0.1
echo "Build complete" >&2
exit 0
`
              );
              await commitChanges(tempGitRepo, "Add init hook");

              const branchName = generateBranchName("hook-test");
              const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
              const runtimeConfig = getRuntimeConfig(branchName);

              // Capture init events
              const initEvents = setupInitEventCapture(env);

              const { result, cleanup } = await createWorkspaceWithCleanup(
                env,
                tempGitRepo,
                branchName,
                trunkBranch,
                runtimeConfig
              );

              expect(result.success).toBe(true);
              if (!result.success) {
                throw new Error(`Failed to create workspace with init hook: ${result.error}`);
              }

              // Wait for init hook to complete (runs asynchronously after workspace creation)
              await new Promise((resolve) => setTimeout(resolve, getInitWaitTime()));

              // Verify init events were emitted
              expect(initEvents.length).toBeGreaterThan(0);

              // Verify output events (stdout/stderr from hook)
              const outputEvents = filterEventsByType(initEvents, EVENT_TYPE_INIT_OUTPUT);
              expect(outputEvents.length).toBeGreaterThan(0);

              // Verify completion event
              const endEvents = filterEventsByType(initEvents, EVENT_TYPE_INIT_END);
              expect(endEvents.length).toBe(1);

              await cleanup();
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          TEST_TIMEOUT_MS
        );

        test.concurrent(
          "handles init hook failure gracefully",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              // Create and commit failing init hook
              await createInitHook(
                tempGitRepo,
                `#!/bin/bash
echo "Starting init..."
echo "Error occurred!" >&2
exit 1
`
              );
              await commitChanges(tempGitRepo, "Add failing hook");

              const branchName = generateBranchName("fail-hook");
              const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
              const runtimeConfig = getRuntimeConfig(branchName);

              // Capture init events
              const initEvents = setupInitEventCapture(env);

              const { result, cleanup } = await createWorkspaceWithCleanup(
                env,
                tempGitRepo,
                branchName,
                trunkBranch,
                runtimeConfig
              );

              // Workspace creation should succeed even if hook fails
              expect(result.success).toBe(true);
              if (!result.success) {
                throw new Error(`Failed to create workspace with failing hook: ${result.error}`);
              }

              // Wait for init hook to complete asynchronously
              await new Promise((resolve) => setTimeout(resolve, getInitWaitTime()));

              // Verify init-end event with non-zero exit code
              const endEvents = filterEventsByType(initEvents, EVENT_TYPE_INIT_END);
              expect(endEvents.length).toBe(1);

              const endEventData = endEvents[0].data as { type: string; exitCode: number };
              expect(endEventData.exitCode).not.toBe(0);
              // Exit code can be 1 (script failure) or 127 (command not found on some systems)

              await cleanup();
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          TEST_TIMEOUT_MS
        );

        test.concurrent(
          "completes successfully when no init hook present",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              const branchName = generateBranchName("no-hook");
              const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
              const runtimeConfig = getRuntimeConfig(branchName);

              const { result, cleanup } = await createWorkspaceWithCleanup(
                env,
                tempGitRepo,
                branchName,
                trunkBranch,
                runtimeConfig
              );

              expect(result.success).toBe(true);
              if (!result.success) {
                throw new Error(`Failed to create workspace without init hook: ${result.error}`);
              }

              expect(result.metadata.id).toBeDefined();

              await cleanup();
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          TEST_TIMEOUT_MS
        );

        // SSH-specific test: verify sync output appears in init stream
        if (type === "ssh") {
          test.concurrent(
            "streams sync progress to init events (SSH only)",
            async () => {
              const env = await createTestEnvironment();
              const tempGitRepo = await createTempGitRepo();

              try {
                const branchName = generateBranchName("sync-test");
                const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
                const runtimeConfig = getRuntimeConfig(branchName);

                // Capture init events
                const initEvents = setupInitEventCapture(env);

                const { result, cleanup } = await createWorkspaceWithCleanup(
                  env,
                  tempGitRepo,
                  branchName,
                  trunkBranch,
                  runtimeConfig
                );

                expect(result.success).toBe(true);
                if (!result.success) {
                  throw new Error(`Failed to create workspace for sync test: ${result.error}`);
                }

                // Wait for init to complete (includes sync + checkout)
                await new Promise((resolve) => setTimeout(resolve, getInitWaitTime()));

                // Verify init events contain sync and checkout steps
                const outputEvents = filterEventsByType(initEvents, EVENT_TYPE_INIT_OUTPUT);
                const outputLines = outputEvents.map((e) => {
                  const data = e.data as { line?: string };
                  return data.line ?? "";
                });

                // Verify key init phases appear in output
                expect(outputLines.some((line) => line.includes("Syncing project files"))).toBe(
                  true
                );
                expect(outputLines.some((line) => line.includes("Checking out branch"))).toBe(true);

                // Verify init-end event was emitted
                const endEvents = filterEventsByType(initEvents, EVENT_TYPE_INIT_END);
                expect(endEvents.length).toBe(1);

                await cleanup();
              } finally {
                await cleanupTestEnvironment(env);
                await cleanupTempGitRepo(tempGitRepo);
              }
            },
            TEST_TIMEOUT_MS
          );

          test.concurrent(
            "handles tilde (~/) paths correctly (SSH only)",
            async () => {
              const env = await createTestEnvironment();
              const tempGitRepo = await createTempGitRepo();

              try {
                const branchName = generateBranchName("tilde-test");
                const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);

                // Use ~/workspace/... path instead of absolute path
                const tildeRuntimeConfig: RuntimeConfig = {
                  type: "ssh",
                  host: `testuser@localhost`,
                  workdir: `~/workspace/${branchName}`,
                  identityFile: sshConfig!.privateKeyPath,
                  port: sshConfig!.port,
                };

                const { result, cleanup } = await createWorkspaceWithCleanup(
                  env,
                  tempGitRepo,
                  branchName,
                  trunkBranch,
                  tildeRuntimeConfig
                );

                expect(result.success).toBe(true);
                if (!result.success) {
                  throw new Error(`Failed to create workspace with tilde path: ${result.error}`);
                }

                // Wait for init to complete
                await new Promise((resolve) => setTimeout(resolve, getInitWaitTime()));

                // Verify workspace exists
                expect(result.metadata.id).toBeDefined();
                expect(result.metadata.namedWorkspacePath).toBeDefined();

                await cleanup();
              } finally {
                await cleanupTestEnvironment(env);
                await cleanupTempGitRepo(tempGitRepo);
              }
            },
            TEST_TIMEOUT_MS
          );

          test.concurrent(
            "handles tilde paths with init hooks (SSH only)",
            async () => {
              const env = await createTestEnvironment();
              const tempGitRepo = await createTempGitRepo();

              try {
                // Add init hook to repo
                await createInitHook(
                  tempGitRepo,
                  `#!/bin/bash
echo "Init hook executed with tilde path"
`
                );
                await commitChanges(tempGitRepo, "Add init hook for tilde test");

                const branchName = generateBranchName("tilde-init-test");
                const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);

                // Use ~/workspace/... path instead of absolute path
                const tildeRuntimeConfig: RuntimeConfig = {
                  type: "ssh",
                  host: `testuser@localhost`,
                  workdir: `~/workspace/${branchName}`,
                  identityFile: sshConfig!.privateKeyPath,
                  port: sshConfig!.port,
                };

                // Capture init events to verify hook output
                const initEvents = setupInitEventCapture(env);

                const { result, cleanup } = await createWorkspaceWithCleanup(
                  env,
                  tempGitRepo,
                  branchName,
                  trunkBranch,
                  tildeRuntimeConfig
                );

                expect(result.success).toBe(true);
                if (!result.success) {
                  throw new Error(
                    `Failed to create workspace with tilde path + init hook: ${result.error}`
                  );
                }

                // Wait for init to complete (including hook)
                await new Promise((resolve) => setTimeout(resolve, getInitWaitTime()));

                // Verify init hook was executed
                const outputEvents = filterEventsByType(initEvents, EVENT_TYPE_INIT_OUTPUT);
                const outputLines = outputEvents.map((e) => {
                  const data = e.data as { line?: string };
                  return data.line ?? "";
                });

                expect(outputLines.some((line) => line.includes("Running init hook"))).toBe(true);
                expect(outputLines.some((line) => line.includes("Init hook executed"))).toBe(true);

                await cleanup();
              } finally {
                await cleanupTestEnvironment(env);
                await cleanupTempGitRepo(tempGitRepo);
              }
            },
            TEST_TIMEOUT_MS
          );

          test.concurrent(
            "can execute commands in workspace immediately after creation (SSH only)",
            async () => {
              const env = await createTestEnvironment();
              const tempGitRepo = await createTempGitRepo();

              try {
                const branchName = generateBranchName("exec-test");
                const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
                const runtimeConfig = getRuntimeConfig(branchName);

                const { result, cleanup } = await createWorkspaceWithCleanup(
                  env,
                  tempGitRepo,
                  branchName,
                  trunkBranch,
                  runtimeConfig
                );

                expect(result.success).toBe(true);
                if (!result.success) {
                  throw new Error(`Failed to create workspace: ${result.error}`);
                }

                // Wait for init to complete
                await new Promise((resolve) => setTimeout(resolve, getInitWaitTime()));

                // Try to execute a command in the workspace
                const workspaceId = result.metadata.id;
                const execResult = await env.mockIpcRenderer.invoke(
                  IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
                  workspaceId,
                  "pwd"
                );

                expect(execResult.success).toBe(true);
                if (!execResult.success) {
                  throw new Error(`Failed to exec in workspace: ${execResult.error}`);
                }

                // Verify we got output from the command
                expect(execResult.data).toBeDefined();
                expect(execResult.data.output).toBeDefined();
                expect(execResult.data.output!.trim().length).toBeGreaterThan(0);

                await cleanup();
              } finally {
                await cleanupTestEnvironment(env);
                await cleanupTempGitRepo(tempGitRepo);
              }
            },
            TEST_TIMEOUT_MS
          );
        }
      });

      describe("Validation", () => {
        test.concurrent(
          "rejects invalid workspace names",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              const invalidCases = [
                { name: "", expectedErrorFragment: "empty" },
                { name: "My-Branch", expectedErrorFragment: "lowercase" },
                { name: "branch name", expectedErrorFragment: "lowercase" },
                { name: "branch@123", expectedErrorFragment: "lowercase" },
                { name: "a".repeat(65), expectedErrorFragment: "64 characters" },
              ];

              const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);

              for (const { name, expectedErrorFragment } of invalidCases) {
                const runtimeConfig = getRuntimeConfig(name);
                const { result } = await createWorkspaceWithCleanup(
                  env,
                  tempGitRepo,
                  name,
                  trunkBranch,
                  runtimeConfig
                );

                expect(result.success).toBe(false);

                if (!result.success) {
                  expect(result.error.toLowerCase()).toContain(expectedErrorFragment.toLowerCase());
                }
              }
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          TEST_TIMEOUT_MS
        );
      });
    }
  );
});

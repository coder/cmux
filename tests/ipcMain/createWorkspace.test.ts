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
import { shouldRunIntegrationTests, createTestEnvironment, cleanupTestEnvironment } from "./setup";
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

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// SSH server config (shared across all SSH tests)
let sshConfig: SSHServerConfig | undefined;

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

              const result = await env.mockIpcRenderer.invoke(
                IPC_CHANNELS.WORKSPACE_CREATE,
                tempGitRepo,
                branchName,
                trunkBranch,
                runtimeConfig
              );

              expect(result.success).toBe(true);
              if (!result.success) {
                console.error("Failed to create workspace:", result.error);
                return;
              }

              // Verify workspace metadata
              expect(result.metadata.id).toBeDefined();
              expect(result.metadata.namedWorkspacePath).toBeDefined();
              expect(result.metadata.projectName).toBeDefined();

              // Clean up
              await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, result.metadata.id);
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          60000
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

              const result = await env.mockIpcRenderer.invoke(
                IPC_CHANNELS.WORKSPACE_CREATE,
                tempGitRepo,
                branchName,
                trunkBranch,
                runtimeConfig
              );

              expect(result.success).toBe(true);
              if (!result.success) {
                console.error("Failed to create workspace:", result.error);
                return;
              }

              expect(result.metadata.id).toBeDefined();

              // Clean up
              await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, result.metadata.id);
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          60000
        );
      });

      describe("Init hook execution", () => {
        test.concurrent(
          "executes .cmux/init hook when present and streams logs",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              // Create init hook
              const cmuxDir = path.join(tempGitRepo, ".cmux");
              await fs.mkdir(cmuxDir, { recursive: true });
              const initHook = path.join(cmuxDir, "init");
              await fs.writeFile(
                initHook,
                `#!/bin/bash
echo "Init hook started"
echo "Installing dependencies..."
sleep 0.1
echo "Build complete" >&2
exit 0
`,
                { mode: 0o755 }
              );

              // Commit the hook so it's in the worktree
              const { exec } = await import("child_process");
              const { promisify } = await import("util");
              const execAsync = promisify(exec);
              await execAsync(`git add .cmux && git commit -m "Add init hook"`, {
                cwd: tempGitRepo,
              });

              const branchName = generateBranchName("hook-test");
              const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
              const runtimeConfig = getRuntimeConfig(branchName);

              // Start listening for init events before creating workspace
              const initEvents: Array<{ channel: string; data: unknown }> = [];
              const originalSend = env.mockWindow.webContents.send;
              env.mockWindow.webContents.send = ((channel: string, data: unknown) => {
                // Init events are sent via the chat channel
                if (
                  channel.startsWith("workspace:chat:") &&
                  data &&
                  typeof data === "object" &&
                  "type" in data
                ) {
                  const typedData = data as { type: string };
                  if (typedData.type.startsWith("init-")) {
                    initEvents.push({ channel, data });
                  }
                }
                originalSend.call(env.mockWindow.webContents, channel, data);
              }) as typeof originalSend;

              const result = await env.mockIpcRenderer.invoke(
                IPC_CHANNELS.WORKSPACE_CREATE,
                tempGitRepo,
                branchName,
                trunkBranch,
                runtimeConfig
              );

              expect(result.success).toBe(true);
              if (!result.success) {
                console.error("Failed to create workspace:", result.error);
                return;
              }

              // Wait for init hook to complete (it runs asynchronously)
              await new Promise((resolve) => setTimeout(resolve, 1500));

              // Verify init hook events were sent
              expect(initEvents.length).toBeGreaterThan(0);

              // Look for init-output events
              const outputEvents = initEvents.filter(
                (e) =>
                  e.data &&
                  typeof e.data === "object" &&
                  "type" in e.data &&
                  e.data.type === "init-output"
              );
              expect(outputEvents.length).toBeGreaterThan(0);

              // Look for init-end event
              const endEvents = initEvents.filter(
                (e) =>
                  e.data &&
                  typeof e.data === "object" &&
                  "type" in e.data &&
                  e.data.type === "init-end"
              );
              expect(endEvents.length).toBe(1);

              // Clean up
              await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, result.metadata.id);
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          60000
        );

        test.concurrent(
          "handles init hook failure gracefully",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              // Create failing init hook
              const cmuxDir = path.join(tempGitRepo, ".cmux");
              await fs.mkdir(cmuxDir, { recursive: true });
              const initHook = path.join(cmuxDir, "init");
              await fs.writeFile(
                initHook,
                `#!/bin/bash
echo "Starting init..."
echo "Error occurred!" >&2
exit 1
`,
                { mode: 0o755 }
              );

              // Commit the hook
              const { exec } = await import("child_process");
              const { promisify } = await import("util");
              const execAsync = promisify(exec);
              await execAsync(`git add .cmux && git commit -m "Add failing hook"`, {
                cwd: tempGitRepo,
              });

              const branchName = generateBranchName("fail-hook");
              const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
              const runtimeConfig = getRuntimeConfig(branchName);

              // Track init events
              const initEvents: Array<{ channel: string; data: unknown }> = [];
              const originalSend = env.mockWindow.webContents.send;
              env.mockWindow.webContents.send = ((channel: string, data: unknown) => {
                // Init events are sent via the chat channel
                if (
                  channel.startsWith("workspace:chat:") &&
                  data &&
                  typeof data === "object" &&
                  "type" in data
                ) {
                  const typedData = data as { type: string };
                  if (typedData.type.startsWith("init-")) {
                    initEvents.push({ channel, data });
                  }
                }
                originalSend.call(env.mockWindow.webContents, channel, data);
              }) as typeof originalSend;

              const result = await env.mockIpcRenderer.invoke(
                IPC_CHANNELS.WORKSPACE_CREATE,
                tempGitRepo,
                branchName,
                trunkBranch,
                runtimeConfig
              );

              // Workspace creation should succeed even if hook fails
              expect(result.success).toBe(true);
              if (!result.success) {
                console.error("Failed to create workspace:", result.error);
                return;
              }

              // Wait for init hook to complete (it runs asynchronously)
              await new Promise((resolve) => setTimeout(resolve, 1500));

              // Verify init-end event with non-zero exit code
              const endEvents = initEvents.filter(
                (e) =>
                  e.data &&
                  typeof e.data === "object" &&
                  "type" in e.data &&
                  e.data.type === "init-end"
              );
              expect(endEvents.length).toBe(1);
              const endEvent = endEvents[0].data as { exitCode: number };
              // Exit code can be 1 (script failure) or 127 (command not found, e.g., in SSH without bash)
              expect(endEvent.exitCode).not.toBe(0);

              // Clean up
              await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, result.metadata.id);
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          60000
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

              const result = await env.mockIpcRenderer.invoke(
                IPC_CHANNELS.WORKSPACE_CREATE,
                tempGitRepo,
                branchName,
                trunkBranch,
                runtimeConfig
              );

              expect(result.success).toBe(true);
              if (!result.success) {
                console.error("Failed to create workspace:", result.error);
                return;
              }

              expect(result.metadata.id).toBeDefined();

              // Clean up
              await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, result.metadata.id);
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          60000
        );
      });

      describe("Validation", () => {
        test.concurrent(
          "rejects invalid workspace names",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              const invalidNames = [
                { name: "", expectedError: "empty" },
                { name: "My-Branch", expectedError: "lowercase" },
                { name: "branch name", expectedError: "lowercase" },
                { name: "branch@123", expectedError: "lowercase" },
                { name: "a".repeat(65), expectedError: "64 characters" },
              ];

              const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);

              for (const { name, expectedError } of invalidNames) {
                const runtimeConfig = getRuntimeConfig(name);
                const result = await env.mockIpcRenderer.invoke(
                  IPC_CHANNELS.WORKSPACE_CREATE,
                  tempGitRepo,
                  name,
                  trunkBranch,
                  runtimeConfig
                );

                expect(result.success).toBe(false);
                if (result.success === false) {
                  expect(result.error.toLowerCase()).toContain(expectedError.toLowerCase());
                }
              }
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          60000
        );
      });
    }
  );
});

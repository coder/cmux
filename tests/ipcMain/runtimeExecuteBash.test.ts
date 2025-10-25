/**
 * Integration tests for bash execution across Local and SSH runtimes
 *
 * Tests bash tool using real IPC handlers on both LocalRuntime and SSHRuntime.
 *
 * Reuses test infrastructure from runtimeFileEditing.test.ts
 */

import {
  createTestEnvironment,
  cleanupTestEnvironment,
  shouldRunIntegrationTests,
  validateApiKeys,
  getApiKey,
  setupProviders,
} from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import { createTempGitRepo, cleanupTempGitRepo, generateBranchName } from "./helpers";
import {
  isDockerAvailable,
  startSSHServer,
  stopSSHServer,
  type SSHServerConfig,
} from "../runtime/ssh-fixture";
import type { RuntimeConfig } from "../../src/types/runtime";
import type { ToolPolicy } from "../../src/utils/tools/toolPolicy";
import {
  createWorkspaceHelper,
  sendMessageAndWait,
  extractTextFromEvents,
} from "./test-helpers/runtimeTestHelpers";

// Test constants
const TEST_TIMEOUT_LOCAL_MS = 25000;
const TEST_TIMEOUT_SSH_MS = 45000;
const HAIKU_MODEL = "anthropic:claude-haiku-4-5";

// Tool policy: Only allow bash tool
const BASH_ONLY: ToolPolicy = [
  { regex_match: "bash", action: "enable" },
  { regex_match: "file_.*", action: "disable" },
];

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["ANTHROPIC_API_KEY"]);
}

// SSH server config (shared across all SSH tests)
let sshConfig: SSHServerConfig | undefined;

describeIntegration("Runtime Bash Execution", () => {
  beforeAll(async () => {
    // Check if Docker is available (required for SSH tests)
    if (!(await isDockerAvailable())) {
      throw new Error(
        "Docker is required for SSH runtime tests. Please install Docker or skip tests by unsetting TEST_INTEGRATION."
      );
    }

    // Start SSH server (shared across all tests for speed)
    console.log("Starting SSH server container for bash tests...");
    sshConfig = await startSSHServer();
    console.log(`SSH server ready on port ${sshConfig.port}`);
  }, 60000);

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

      test.concurrent(
        "should execute simple bash command",
        async () => {
          const env = await createTestEnvironment();
          const tempGitRepo = await createTempGitRepo();

          try {
            // Setup provider
            await setupProviders(env.mockIpcRenderer, {
              anthropic: {
                apiKey: getApiKey("ANTHROPIC_API_KEY"),
              },
            });

            // Create workspace
            const branchName = generateBranchName("bash-simple");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId, cleanup } = await createWorkspaceHelper(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              type === "ssh"
            );

            try {
              // Ask AI to run a simple command
              const events = await sendMessageAndWait(
                env,
                workspaceId,
                'Run the bash command "echo Hello World"',
                HAIKU_MODEL,
                BASH_ONLY
              );

              // Extract response text
              const responseText = extractTextFromEvents(events);

              // Verify the command output appears in the response
              expect(responseText.toLowerCase()).toContain("hello world");

              // Verify bash tool was called
              const toolCalls = events.filter(
                (e: any) => e.type === "tool-call-delta" && e.toolName
              );
              const bashCall = toolCalls.find((e: any) => e.toolName === "bash");
              expect(bashCall).toBeDefined();
            } finally {
              await cleanup();
            }
          } finally {
            await cleanupTempGitRepo(tempGitRepo);
            await cleanupTestEnvironment(env);
          }
        },
        type === "ssh" ? TEST_TIMEOUT_SSH_MS : TEST_TIMEOUT_LOCAL_MS
      );

      test.concurrent(
        "should handle bash command with environment variables",
        async () => {
          const env = await createTestEnvironment();
          const tempGitRepo = await createTempGitRepo();

          try {
            // Setup provider
            await setupProviders(env.mockIpcRenderer, {
              anthropic: {
                apiKey: getApiKey("ANTHROPIC_API_KEY"),
              },
            });

            // Create workspace
            const branchName = generateBranchName("bash-env");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId, cleanup } = await createWorkspaceHelper(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              type === "ssh"
            );

            try {
              // Ask AI to run command that sets and uses env var
              const events = await sendMessageAndWait(
                env,
                workspaceId,
                'Run bash command: export TEST_VAR="test123" && echo "Value: $TEST_VAR"',
                HAIKU_MODEL,
                BASH_ONLY
              );

              // Extract response text
              const responseText = extractTextFromEvents(events);

              // Verify the env var value appears
              expect(responseText).toContain("test123");

              // Verify bash tool was called
              const toolCalls = events.filter(
                (e: any) => e.type === "tool-call-delta" && e.toolName
              );
              const bashCall = toolCalls.find((e: any) => e.toolName === "bash");
              expect(bashCall).toBeDefined();
            } finally {
              await cleanup();
            }
          } finally {
            await cleanupTempGitRepo(tempGitRepo);
            await cleanupTestEnvironment(env);
          }
        },
        type === "ssh" ? TEST_TIMEOUT_SSH_MS : TEST_TIMEOUT_LOCAL_MS
      );

      test.concurrent(
        "should handle bash command with special characters",
        async () => {
          const env = await createTestEnvironment();
          const tempGitRepo = await createTempGitRepo();

          try {
            // Setup provider
            await setupProviders(env.mockIpcRenderer, {
              anthropic: {
                apiKey: getApiKey("ANTHROPIC_API_KEY"),
              },
            });

            // Create workspace
            const branchName = generateBranchName("bash-special");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId, cleanup } = await createWorkspaceHelper(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              type === "ssh"
            );

            try {
              // Ask AI to run command with special chars
              const events = await sendMessageAndWait(
                env,
                workspaceId,
                'Run bash: echo "Test with $dollar and \\"quotes\\" and `backticks`"',
                HAIKU_MODEL,
                BASH_ONLY
              );

              // Extract response text
              const responseText = extractTextFromEvents(events);

              // Verify special chars were handled correctly
              expect(responseText).toContain("dollar");
              expect(responseText).toContain("quotes");

              // Verify bash tool was called
              const toolCalls = events.filter(
                (e: any) => e.type === "tool-call-delta" && e.toolName
              );
              const bashCall = toolCalls.find((e: any) => e.toolName === "bash");
              expect(bashCall).toBeDefined();
            } finally {
              await cleanup();
            }
          } finally {
            await cleanupTempGitRepo(tempGitRepo);
            await cleanupTestEnvironment(env);
          }
        },
        type === "ssh" ? TEST_TIMEOUT_SSH_MS : TEST_TIMEOUT_LOCAL_MS
      );
    }
  );
});

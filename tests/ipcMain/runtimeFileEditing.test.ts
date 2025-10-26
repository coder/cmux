/**
 * Integration tests for file editing tools across Local and SSH runtimes
 *
 * Tests file_read, file_edit_replace_string, and file_edit_insert tools
 * using real IPC handlers on both LocalRuntime and SSHRuntime.
 *
 * Uses toolPolicy to restrict AI to only file tools (prevents bash circumvention).
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  createTestEnvironment,
  cleanupTestEnvironment,
  shouldRunIntegrationTests,
  validateApiKeys,
  getApiKey,
  setupProviders,
  preloadTestModules,
  type TestEnvironment,
} from "./setup";
import { IPC_CHANNELS, getChatChannel } from "../../src/constants/ipc-constants";
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
import type { WorkspaceChatMessage } from "../../src/types/ipc";
import type { ToolPolicy } from "../../src/utils/tools/toolPolicy";

// Test constants
const TEST_TIMEOUT_LOCAL_MS = 25000; // Includes init wait time
const TEST_TIMEOUT_SSH_MS = 60000; // SSH has more overhead (network, rsync, etc.)
const STREAM_TIMEOUT_LOCAL_MS = 15000; // Stream timeout for local runtime
const STREAM_TIMEOUT_SSH_MS = 25000; // SSH needs longer due to network latency
const HAIKU_MODEL = "anthropic:claude-haiku-4-5";
const INIT_HOOK_WAIT_MS = 1500; // Wait for async init hook completion (local runtime)
const SSH_INIT_WAIT_MS = 7000; // SSH init includes sync + checkout + hook, takes longer

// Tool policy: Only allow file tools (disable bash to isolate file tool issues)
const FILE_TOOLS_ONLY: ToolPolicy = [
  { regex_match: "file_.*", action: "enable" },
  { regex_match: "bash", action: "disable" },
];

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["ANTHROPIC_API_KEY"]);
}

// SSH server config (shared across all SSH tests)
let sshConfig: SSHServerConfig | undefined;

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Wait for a specific event type to appear in the stream
 */
async function waitForEvent(
  sentEvents: Array<{ channel: string; data: unknown }>,
  workspaceId: string,
  eventType: string,
  timeoutMs: number
): Promise<WorkspaceChatMessage[]> {
  const startTime = Date.now();
  const chatChannel = getChatChannel(workspaceId);
  let pollInterval = 50;

  while (Date.now() - startTime < timeoutMs) {
    const events = sentEvents
      .filter((e) => e.channel === chatChannel)
      .map((e) => e.data as WorkspaceChatMessage);

    // Check if the event has appeared
    const targetEvent = events.find((e) => "type" in e && e.type === eventType);
    if (targetEvent) {
      return events;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, 500);
  }

  throw new Error(`Event ${eventType} did not appear within ${timeoutMs}ms`);
}

/**
 * Wait for stream to complete and collect all events
 */
async function waitForStreamCompletion(
  sentEvents: Array<{ channel: string; data: unknown }>,
  workspaceId: string,
  timeoutMs = 15000 // Reduced for simple operations with fast model
): Promise<WorkspaceChatMessage[]> {
  return waitForEvent(sentEvents, workspaceId, "stream-end", timeoutMs);
}

/**
 * Extract text content from stream events
 */
function extractTextFromEvents(events: WorkspaceChatMessage[]): string {
  return events
    .filter((e) => "type" in e && e.type === "stream-delta" && "delta" in e)
    .map((e: any) => e.delta || "")
    .join("");
}

/**
 * Create workspace helper and wait for init hook to complete
 */
async function createWorkspaceHelper(
  env: TestEnvironment,
  projectPath: string,
  branchName: string,
  runtimeConfig?: RuntimeConfig,
  isSSH: boolean = false
): Promise<{
  workspaceId: string;
  cleanup: () => Promise<void>;
}> {
  const trunkBranch = await detectDefaultTrunkBranch(projectPath);
  const result = await env.mockIpcRenderer.invoke(
    IPC_CHANNELS.WORKSPACE_CREATE,
    projectPath,
    branchName,
    trunkBranch,
    runtimeConfig
  );

  if (!result.success) {
    throw new Error(`Failed to create workspace: ${result.error}`);
  }

  const workspaceId = result.metadata.id;

  // Wait for init hook to complete by watching for init-end event
  // This is critical - file operations will fail if init hasn't finished
  const initTimeout = isSSH ? SSH_INIT_WAIT_MS : INIT_HOOK_WAIT_MS;
  try {
    await waitForEvent(env.sentEvents, workspaceId, "init-end", initTimeout);
  } catch (err) {
    // Init hook might not exist or might have already completed before we started waiting
    // This is not necessarily an error - just log it
    console.log(
      `Note: init-end event not detected within ${initTimeout}ms (may have completed early)`
    );
  }

  const cleanup = async () => {
    await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
  };

  return { workspaceId, cleanup };
}

/**
 * Send message and wait for completion
 */
async function sendMessageAndWait(
  env: TestEnvironment,
  workspaceId: string,
  message: string,
  streamTimeout?: number
): Promise<WorkspaceChatMessage[]> {
  // Clear previous events
  env.sentEvents.length = 0;

  // Send message with Haiku model and file-tools-only policy
  const result = await env.mockIpcRenderer.invoke(
    IPC_CHANNELS.WORKSPACE_SEND_MESSAGE,
    workspaceId,
    message,
    {
      model: HAIKU_MODEL,
      toolPolicy: FILE_TOOLS_ONLY,
    }
  );

  if (!result.success) {
    throw new Error(`Failed to send message: ${result.error}`);
  }

  // Wait for stream completion
  return await waitForStreamCompletion(env.sentEvents, workspaceId, streamTimeout);
}

// ============================================================================
// Tests
// ============================================================================

describeIntegration("Runtime File Editing Tools", () => {
  beforeAll(async () => {
    // Preload AI SDK providers and tokenizers to avoid race conditions in concurrent tests
    await preloadTestModules();

    // Check if Docker is available (required for SSH tests)
    if (!(await isDockerAvailable())) {
      throw new Error(
        "Docker is required for SSH runtime tests. Please install Docker or skip tests by unsetting TEST_INTEGRATION."
      );
    }

    // Start SSH server (shared across all tests for speed)
    console.log("Starting SSH server container for file editing tests...");
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
            srcBaseDir: `${sshConfig.workdir}/${branchName}`,
            identityFile: sshConfig.privateKeyPath,
            port: sshConfig.port,
          };
        }
        return undefined; // undefined = defaults to local
      };

      test.concurrent(
        "should read file content with file_read tool",
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
            const branchName = generateBranchName("read-test");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId, cleanup } = await createWorkspaceHelper(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              type === "ssh"
            );

            try {
              // Ask AI to create a test file
              const testFileName = "test_read.txt";
              const streamTimeout =
                type === "ssh" ? STREAM_TIMEOUT_SSH_MS : STREAM_TIMEOUT_LOCAL_MS;
              const createEvents = await sendMessageAndWait(
                env,
                workspaceId,
                `Create a file called ${testFileName} with the content: "Hello from cmux file tools!"`,
                streamTimeout
              );

              // Verify file was created successfully
              const createStreamEnd = createEvents.find(
                (e) => "type" in e && e.type === "stream-end"
              );
              expect(createStreamEnd).toBeDefined();
              expect((createStreamEnd as any).error).toBeUndefined();

              // Now ask AI to read the file
              const readEvents = await sendMessageAndWait(
                env,
                workspaceId,
                `Read the file ${testFileName} and tell me what it contains.`,
                streamTimeout
              );

              // Verify stream completed successfully
              const streamEnd = readEvents.find((e) => "type" in e && e.type === "stream-end");
              expect(streamEnd).toBeDefined();
              expect((streamEnd as any).error).toBeUndefined();

              // Verify file_read tool was called
              const toolCalls = readEvents.filter(
                (e) => "type" in e && e.type === "tool-call-start"
              );
              const fileReadCall = toolCalls.find((e: any) => e.toolName === "file_read");
              expect(fileReadCall).toBeDefined();

              // Verify response mentions the content
              const responseText = extractTextFromEvents(readEvents);
              expect(responseText.toLowerCase()).toContain("hello");
            } finally {
              await cleanup();
            }
          } finally {
            await cleanupTestEnvironment(env);
            await cleanupTempGitRepo(tempGitRepo);
          }
        },
        type === "ssh" ? TEST_TIMEOUT_SSH_MS : TEST_TIMEOUT_LOCAL_MS
      );

      test.concurrent(
        "should replace text with file_edit_replace_string tool",
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
            const branchName = generateBranchName("replace-test");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId, cleanup } = await createWorkspaceHelper(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              type === "ssh"
            );

            try {
              // Ask AI to create a test file
              const testFileName = "test_replace.txt";
              const streamTimeout =
                type === "ssh" ? STREAM_TIMEOUT_SSH_MS : STREAM_TIMEOUT_LOCAL_MS;
              const createEvents = await sendMessageAndWait(
                env,
                workspaceId,
                `Create a file called ${testFileName} with the content: "The quick brown fox jumps over the lazy dog."`,
                streamTimeout
              );

              // Verify file was created successfully
              const createStreamEnd = createEvents.find(
                (e) => "type" in e && e.type === "stream-end"
              );
              expect(createStreamEnd).toBeDefined();
              expect((createStreamEnd as any).error).toBeUndefined();

              // Ask AI to replace text
              const replaceEvents = await sendMessageAndWait(
                env,
                workspaceId,
                `In ${testFileName}, replace "brown fox" with "red panda".`,
                streamTimeout
              );

              // Verify stream completed successfully
              const streamEnd = replaceEvents.find((e) => "type" in e && e.type === "stream-end");
              expect(streamEnd).toBeDefined();
              expect((streamEnd as any).error).toBeUndefined();

              // Verify file_edit_replace_string tool was called
              const toolCalls = replaceEvents.filter(
                (e) => "type" in e && e.type === "tool-call-start"
              );
              const replaceCall = toolCalls.find(
                (e: any) => e.toolName === "file_edit_replace_string"
              );
              expect(replaceCall).toBeDefined();

              // Verify the replacement was successful (check for diff or success message)
              const responseText = extractTextFromEvents(replaceEvents);
              expect(
                responseText.toLowerCase().includes("replace") ||
                  responseText.toLowerCase().includes("changed") ||
                  responseText.toLowerCase().includes("updated")
              ).toBe(true);
            } finally {
              await cleanup();
            }
          } finally {
            await cleanupTestEnvironment(env);
            await cleanupTempGitRepo(tempGitRepo);
          }
        },
        type === "ssh" ? TEST_TIMEOUT_SSH_MS : TEST_TIMEOUT_LOCAL_MS
      );

      test.concurrent(
        "should insert text with file_edit_insert tool",
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
            const branchName = generateBranchName("insert-test");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId, cleanup } = await createWorkspaceHelper(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              type === "ssh"
            );

            try {
              // Ask AI to create a test file
              const testFileName = "test_insert.txt";
              const streamTimeout =
                type === "ssh" ? STREAM_TIMEOUT_SSH_MS : STREAM_TIMEOUT_LOCAL_MS;
              const createEvents = await sendMessageAndWait(
                env,
                workspaceId,
                `Create a file called ${testFileName} with two lines: "Line 1" and "Line 3".`,
                streamTimeout
              );

              // Verify file was created successfully
              const createStreamEnd = createEvents.find(
                (e) => "type" in e && e.type === "stream-end"
              );
              expect(createStreamEnd).toBeDefined();
              expect((createStreamEnd as any).error).toBeUndefined();

              // Ask AI to insert text
              const insertEvents = await sendMessageAndWait(
                env,
                workspaceId,
                `In ${testFileName}, insert "Line 2" between Line 1 and Line 3.`,
                streamTimeout
              );

              // Verify stream completed successfully
              const streamEnd = insertEvents.find((e) => "type" in e && e.type === "stream-end");
              expect(streamEnd).toBeDefined();
              expect((streamEnd as any).error).toBeUndefined();

              // Verify file_edit_insert tool was called
              const toolCalls = insertEvents.filter(
                (e) => "type" in e && e.type === "tool-call-start"
              );
              const insertCall = toolCalls.find((e: any) => e.toolName === "file_edit_insert");
              expect(insertCall).toBeDefined();

              // Verify the insertion was successful
              const responseText = extractTextFromEvents(insertEvents);
              expect(
                responseText.toLowerCase().includes("insert") ||
                  responseText.toLowerCase().includes("add") ||
                  responseText.toLowerCase().includes("updated")
              ).toBe(true);
            } finally {
              await cleanup();
            }
          } finally {
            await cleanupTestEnvironment(env);
            await cleanupTempGitRepo(tempGitRepo);
          }
        },
        type === "ssh" ? TEST_TIMEOUT_SSH_MS : TEST_TIMEOUT_LOCAL_MS
      );

      test.concurrent(
        "should handle relative paths correctly when editing files",
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
            const branchName = generateBranchName("relative-path-test");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId, cleanup } = await createWorkspaceHelper(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              type === "ssh"
            );

            try {
              const streamTimeout =
                type === "ssh" ? STREAM_TIMEOUT_SSH_MS : STREAM_TIMEOUT_LOCAL_MS;

              // Create a file using AI with a relative path
              const relativeTestFile = "subdir/relative_test.txt";
              const createEvents = await sendMessageAndWait(
                env,
                workspaceId,
                `Create a file at path "${relativeTestFile}" with content: "Original content"`,
                streamTimeout
              );

              // Verify file was created successfully
              const createStreamEnd = createEvents.find(
                (e) => "type" in e && e.type === "stream-end"
              );
              expect(createStreamEnd).toBeDefined();
              expect((createStreamEnd as any).error).toBeUndefined();

              // Now edit the file using a relative path
              const editEvents = await sendMessageAndWait(
                env,
                workspaceId,
                `Replace the text in ${relativeTestFile}: change "Original" to "Modified"`,
                streamTimeout
              );

              // Verify edit was successful
              const editStreamEnd = editEvents.find((e) => "type" in e && e.type === "stream-end");
              expect(editStreamEnd).toBeDefined();
              expect((editStreamEnd as any).error).toBeUndefined();

              // Verify file_edit_replace_string tool was called
              const toolCalls = editEvents.filter(
                (e) => "type" in e && e.type === "tool-call-start"
              );
              const editCall = toolCalls.find(
                (e: any) => e.toolName === "file_edit_replace_string"
              );
              expect(editCall).toBeDefined();

              // Read the file to verify the edit was applied
              const readEvents = await sendMessageAndWait(
                env,
                workspaceId,
                `Read the file ${relativeTestFile} and tell me its content`,
                streamTimeout
              );

              const responseText = extractTextFromEvents(readEvents);
              // The file should contain "Modified" not "Original"
              expect(responseText.toLowerCase()).toContain("modified");

              // If this is SSH, the bug would cause the edit to fail because
              // path.resolve() would resolve relative to the LOCAL filesystem
              // instead of the REMOTE filesystem
            } finally {
              await cleanup();
            }
          } finally {
            await cleanupTestEnvironment(env);
            await cleanupTempGitRepo(tempGitRepo);
          }
        },
        type === "ssh" ? TEST_TIMEOUT_SSH_MS : TEST_TIMEOUT_LOCAL_MS
      );
    }
  );
});

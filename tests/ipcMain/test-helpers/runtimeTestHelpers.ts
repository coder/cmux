/**
 * Shared test helpers for runtime integration tests
 *
 * These helpers are used across multiple test files (runtimeFileEditing, runtimeExecuteBash, etc.)
 * to reduce code duplication and ensure consistent test patterns.
 */

import { IPC_CHANNELS, getChatChannel } from "../../../src/constants/ipc-constants";
import { detectDefaultTrunkBranch } from "../../../src/git";
import type { TestEnvironment } from "../setup";
import type { RuntimeConfig } from "../../../src/types/runtime";
import type { WorkspaceChatMessage } from "../../../src/types/ipc";
import type { ToolPolicy } from "../../../src/utils/tools/toolPolicy";

// Constants
const INIT_HOOK_WAIT_MS = 1500; // Wait for async init hook completion (local runtime)
const SSH_INIT_WAIT_MS = 7000; // SSH init includes sync + checkout + hook, takes longer

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
  timeoutMs = 20000 // Sufficient for most operations with fast models
): Promise<WorkspaceChatMessage[]> {
  return waitForEvent(sentEvents, workspaceId, "stream-end", timeoutMs);
}

/**
 * Create a workspace and wait for init hook completion
 */
export async function createWorkspaceHelper(
  env: TestEnvironment,
  repoPath: string,
  branchName: string,
  runtimeConfig: RuntimeConfig | undefined,
  isSSH: boolean
): Promise<{ workspaceId: string; cleanup: () => Promise<void> }> {
  // Detect trunk branch
  const trunkBranch = await detectDefaultTrunkBranch(repoPath);

  // Create workspace
  const result: any = await env.mockIpcRenderer.invoke(
    IPC_CHANNELS.WORKSPACE_CREATE,
    repoPath,
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
export async function sendMessageAndWait(
  env: TestEnvironment,
  workspaceId: string,
  message: string,
  model: string,
  toolPolicy: ToolPolicy
): Promise<WorkspaceChatMessage[]> {
  // Clear previous events
  env.sentEvents.length = 0;

  // Send message
  const result = await env.mockIpcRenderer.invoke(
    IPC_CHANNELS.WORKSPACE_SEND_MESSAGE,
    workspaceId,
    message,
    {
      model,
      toolPolicy,
    }
  );

  if (!result.success) {
    throw new Error(`Failed to send message: ${result.error}`);
  }

  // Wait for stream completion
  return await waitForStreamCompletion(env.sentEvents, workspaceId);
}

/**
 * Extract text content from stream events
 */
export function extractTextFromEvents(events: WorkspaceChatMessage[]): string {
  return events
    .filter((e: any) => e.type === "stream-delta" && "delta" in e)
    .map((e: any) => e.delta || "")
    .join("");
}

import type { IpcRenderer } from "electron";
import { IPC_CHANNELS, getChatChannel } from "../../src/constants/ipc-constants";
import type { SendMessageOptions, WorkspaceChatMessage } from "../../src/types/ipc";
import type { Result } from "../../src/types/result";
import type { SendMessageError } from "../../src/types/errors";
import type { WorkspaceMetadataWithPaths } from "../../src/types/workspace";
import * as path from "path";
import * as os from "os";
import { detectDefaultTrunkBranch } from "../../src/git";

/**
 * Generate a unique branch name
 * Uses high-resolution time (nanosecond precision) to prevent collisions
 */
export function generateBranchName(prefix = "test"): string {
  const hrTime = process.hrtime.bigint();
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${hrTime}-${random}`;
}

/**
 * Create a full model string from provider and model name
 */
export function modelString(provider: string, model: string): string {
  return `${provider}:${model}`;
}

/**
 * Send a message via IPC
 */
export async function sendMessage(
  mockIpcRenderer: IpcRenderer,
  workspaceId: string,
  message: string,
  options?: SendMessageOptions
): Promise<Result<void, SendMessageError>> {
  return (await mockIpcRenderer.invoke(
    IPC_CHANNELS.WORKSPACE_SEND_MESSAGE,
    workspaceId,
    message,
    options
  )) as Result<void, SendMessageError>;
}

/**
 * Send a message with a provider and model (convenience wrapper)
 */
export async function sendMessageWithModel(
  mockIpcRenderer: IpcRenderer,
  workspaceId: string,
  message: string,
  provider = "anthropic",
  model = "claude-sonnet-4-5",
  options?: Omit<SendMessageOptions, "model">
): Promise<Result<void, SendMessageError>> {
  return sendMessage(mockIpcRenderer, workspaceId, message, {
    ...options,
    model: modelString(provider, model),
  });
}

/**
 * Create a workspace via IPC
 */
export async function createWorkspace(
  mockIpcRenderer: IpcRenderer,
  projectPath: string,
  branchName: string,
  trunkBranch?: string
): Promise<
  { success: true; metadata: WorkspaceMetadataWithPaths } | { success: false; error: string }
> {
  const resolvedTrunk =
    typeof trunkBranch === "string" && trunkBranch.trim().length > 0
      ? trunkBranch.trim()
      : await detectDefaultTrunkBranch(projectPath);

  return (await mockIpcRenderer.invoke(
    IPC_CHANNELS.WORKSPACE_CREATE,
    projectPath,
    branchName,
    resolvedTrunk
  )) as { success: true; metadata: WorkspaceMetadataWithPaths } | { success: false; error: string };
}

/**
 * Clear workspace history via IPC
 */
export async function clearHistory(
  mockIpcRenderer: IpcRenderer,
  workspaceId: string
): Promise<Result<void, string>> {
  return (await mockIpcRenderer.invoke(
    IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY,
    workspaceId
  )) as Result<void, string>;
}

/**
 * Event collector for capturing stream events
 */
export class EventCollector {
  private events: WorkspaceChatMessage[] = [];
  private sentEvents: Array<{ channel: string; data: unknown }>;
  private workspaceId: string;
  private chatChannel: string;

  constructor(sentEvents: Array<{ channel: string; data: unknown }>, workspaceId: string) {
    this.sentEvents = sentEvents;
    this.workspaceId = workspaceId;
    this.chatChannel = getChatChannel(workspaceId);
  }

  /**
   * Collect all events for this workspace from the sent events array
   */
  collect(): WorkspaceChatMessage[] {
    this.events = this.sentEvents
      .filter((e) => e.channel === this.chatChannel)
      .map((e) => e.data as WorkspaceChatMessage);
    return this.events;
  }

  /**
   * Get the collected events
   */
  getEvents(): WorkspaceChatMessage[] {
    return this.events;
  }

  /**
   * Wait for a specific event type with exponential backoff
   */
  async waitForEvent(eventType: string, timeoutMs = 30000): Promise<WorkspaceChatMessage | null> {
    const startTime = Date.now();
    let pollInterval = 50; // Start with 50ms for faster detection

    while (Date.now() - startTime < timeoutMs) {
      this.collect();
      const event = this.events.find((e) => "type" in e && e.type === eventType);
      if (event) {
        return event;
      }
      // Exponential backoff with max 500ms
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      pollInterval = Math.min(pollInterval * 1.5, 500);
    }

    // Log diagnostic info on timeout
    const eventTypes = this.events
      .filter((e) => "type" in e)
      .map((e) => (e as { type: string }).type);
    console.warn(
      `waitForEvent timeout: Expected "${eventType}" but got events: [${eventTypes.join(", ")}]`
    );

    // If there was a stream-error, log the error details
    const errorEvent = this.events.find((e) => "type" in e && e.type === "stream-error");
    if (errorEvent && "error" in errorEvent) {
      console.error("Stream error details:", errorEvent.error);
      if ("errorType" in errorEvent) {
        console.error("Stream error type:", errorEvent.errorType);
      }
    }

    return null;
  }

  /**
   * Check if stream completed successfully
   */
  hasStreamEnd(): boolean {
    return this.events.some((e) => "type" in e && e.type === "stream-end");
  }

  /**
   * Check if stream had an error
   */
  hasError(): boolean {
    return this.events.some((e) => "type" in e && e.type === "stream-error");
  }

  /**
   * Get all stream-delta events
   */
  getDeltas(): WorkspaceChatMessage[] {
    return this.events.filter((e) => "type" in e && e.type === "stream-delta");
  }

  /**
   * Get the final assistant message (from stream-end)
   */
  getFinalMessage(): WorkspaceChatMessage | undefined {
    return this.events.find((e) => "type" in e && e.type === "stream-end");
  }
}

/**
 * Create an event collector for a workspace
 */
export function createEventCollector(
  sentEvents: Array<{ channel: string; data: unknown }>,
  workspaceId: string
): EventCollector {
  return new EventCollector(sentEvents, workspaceId);
}

/**
 * Assert that a stream completed successfully
 * Provides helpful error messages when assertions fail
 */
export function assertStreamSuccess(collector: EventCollector): void {
  const allEvents = collector.getEvents();
  const eventTypes = allEvents.filter((e) => "type" in e).map((e) => (e as { type: string }).type);

  // Check for stream-end
  if (!collector.hasStreamEnd()) {
    const errorEvent = allEvents.find((e) => "type" in e && e.type === "stream-error");
    if (errorEvent && "error" in errorEvent) {
      throw new Error(
        `Stream did not complete successfully. Got stream-error: ${errorEvent.error}\n` +
          `All events: [${eventTypes.join(", ")}]`
      );
    }
    throw new Error(
      `Stream did not emit stream-end event.\n` + `All events: [${eventTypes.join(", ")}]`
    );
  }

  // Check for errors
  if (collector.hasError()) {
    const errorEvent = allEvents.find((e) => "type" in e && e.type === "stream-error");
    const errorMsg = errorEvent && "error" in errorEvent ? errorEvent.error : "unknown";
    throw new Error(
      `Stream completed but also has error event: ${errorMsg}\n` +
        `All events: [${eventTypes.join(", ")}]`
    );
  }

  // Check for final message
  const finalMessage = collector.getFinalMessage();
  if (!finalMessage) {
    throw new Error(
      `Stream completed but final message is missing.\n` + `All events: [${eventTypes.join(", ")}]`
    );
  }
}

/**
 * Assert that a result has a specific error type
 */
export function assertError(
  result: Result<void, SendMessageError>,
  expectedErrorType: string
): void {
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.type).toBe(expectedErrorType);
  }
}

/**
 * Poll for a condition with exponential backoff
 * More robust than fixed sleeps for async operations
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  pollIntervalMs = 50
): Promise<boolean> {
  const startTime = Date.now();
  let currentInterval = pollIntervalMs;

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, currentInterval));
    // Exponential backoff with max 500ms
    currentInterval = Math.min(currentInterval * 1.5, 500);
  }

  return false;
}

/**
 * Wait for a file to exist with retry logic
 * Useful for checking file operations that may take time
 */
export async function waitForFileExists(filePath: string, timeoutMs = 5000): Promise<boolean> {
  const fs = await import("fs/promises");
  return waitFor(async () => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }, timeoutMs);
}

/**
 * Wait for stream to complete successfully
 * Common pattern: create collector, wait for end, assert success
 */
export async function waitForStreamSuccess(
  sentEvents: Array<{ channel: string; data: unknown }>,
  workspaceId: string,
  timeoutMs = 30000
): Promise<EventCollector> {
  const collector = createEventCollector(sentEvents, workspaceId);
  await collector.waitForEvent("stream-end", timeoutMs);
  assertStreamSuccess(collector);
  return collector;
}

/**
 * Read and parse chat history from disk
 */
export async function readChatHistory(
  tempDir: string,
  workspaceId: string
): Promise<Array<{ role: string; parts: Array<{ type: string; [key: string]: unknown }> }>> {
  const fsPromises = await import("fs/promises");
  const historyPath = path.join(tempDir, "sessions", workspaceId, "chat.jsonl");
  const historyContent = await fsPromises.readFile(historyPath, "utf-8");
  return historyContent
    .trim()
    .split("\n")
    .map((line: string) => JSON.parse(line));
}

/**
 * Test image fixtures (1x1 pixel PNGs)
 */
export const TEST_IMAGES = {
  RED_PIXEL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  BLUE_PIXEL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
} as const;

/**
 * Wait for a file to NOT exist with retry logic
 */
export async function waitForFileNotExists(filePath: string, timeoutMs = 5000): Promise<boolean> {
  const fs = await import("fs/promises");
  return waitFor(async () => {
    try {
      await fs.access(filePath);
      return false;
    } catch {
      return true;
    }
  }, timeoutMs);
}

/**
 * Create a temporary git repository for testing
 */
export async function createTempGitRepo(): Promise<string> {
  const fs = await import("fs/promises");
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  // eslint-disable-next-line local/no-unsafe-child-process
  const execAsync = promisify(exec);

  // Use mkdtemp to avoid race conditions and ensure unique directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-test-repo-"));

  // Use promisify(exec) for test setup - DisposableExec has issues in CI
  // TODO: Investigate why DisposableExec causes empty git output in CI
  await execAsync(`git init`, { cwd: tempDir });
  await execAsync(`git config user.email "test@example.com" && git config user.name "Test User"`, {
    cwd: tempDir,
  });
  await execAsync(
    `echo "test" > README.md && git add . && git commit -m "Initial commit" && git branch test-branch`,
    { cwd: tempDir }
  );

  return tempDir;
}

/**
 * Add a git submodule to a repository
 * @param repoPath - Path to the repository to add the submodule to
 * @param submoduleUrl - URL of the submodule repository (defaults to leftpad)
 * @param submoduleName - Name/path for the submodule
 */
export async function addSubmodule(
  repoPath: string,
  submoduleUrl: string = "https://github.com/left-pad/left-pad.git",
  submoduleName: string = "vendor/left-pad"
): Promise<void> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  await execAsync(`git submodule add "${submoduleUrl}" "${submoduleName}"`, { cwd: repoPath });
  await execAsync(`git commit -m "Add submodule ${submoduleName}"`, { cwd: repoPath });
}

/**
 * Cleanup temporary git repository with retry logic
 */
export async function cleanupTempGitRepo(repoPath: string): Promise<void> {
  const fs = await import("fs/promises");
  const maxRetries = 3;
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      // Wait before retry (files might be locked temporarily)
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
      }
    }
  }
  console.warn(`Failed to cleanup temp git repo after ${maxRetries} attempts:`, lastError);
}

/**
 * Build large conversation history to test context limits
 *
 * This is a test-only utility that uses HistoryService directly to quickly
 * populate history without making API calls. Real application code should
 * NEVER bypass IPC like this.
 *
 * @param workspaceId - Workspace to populate
 * @param config - Config instance for HistoryService
 * @param options - Configuration for history size
 * @returns Promise that resolves when history is built
 */
export async function buildLargeHistory(
  workspaceId: string,
  config: { getSessionDir: (id: string) => string },
  options: {
    messageSize?: number;
    messageCount?: number;
    textPrefix?: string;
  } = {}
): Promise<void> {
  const { HistoryService } = await import("../../src/services/historyService");
  const { createCmuxMessage } = await import("../../src/types/message");

  // HistoryService only needs getSessionDir, so we can cast the partial config
  const historyService = new HistoryService(config as any);

  const messageSize = options.messageSize ?? 50_000;
  const messageCount = options.messageCount ?? 80;
  const textPrefix = options.textPrefix ?? "";

  const largeText = textPrefix + "A".repeat(messageSize);

  // Build conversation history with alternating user/assistant messages
  for (let i = 0; i < messageCount; i++) {
    const isUser = i % 2 === 0;
    const role = isUser ? "user" : "assistant";
    const message = createCmuxMessage(`history-msg-${i}`, role, largeText, {});

    const result = await historyService.appendToHistory(workspaceId, message);
    if (!result.success) {
      throw new Error(`Failed to append message ${i} to history: ${result.error}`);
    }
  }
}

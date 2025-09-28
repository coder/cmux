import * as fs from "fs/promises";
import * as path from "path";
import { EventEmitter } from "events";
import { convertToModelMessages } from "ai";
import { Result, Ok, Err } from "../types/result";
import { WorkspaceMetadata } from "../types/workspace";
import { CmuxMessage, createCmuxMessage } from "../types/message";
import { SESSIONS_DIR, getSessionDir } from "../config";
import { StreamManager } from "./streamManager";
import type { StreamEndEvent } from "../types/aiEvents";

// Pipe-safe console.error wrapper
function safeLogError(...args: unknown[]): void {
  try {
    console.error(...args);
  } catch (error) {
    // Silently ignore EPIPE and other console errors
    const errorCode =
      error && typeof error === "object" && "code" in error ? error.code : undefined;
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unknown error";

    if (errorCode !== "EPIPE") {
      try {
        process.stderr.write(`Console error: ${errorMessage}\n`);
      } catch {
        // Even stderr might fail, just ignore
      }
    }
  }
}

export class AIService extends EventEmitter {
  private readonly CHAT_FILE = "chat.jsonl";
  private readonly METADATA_FILE = "metadata.json";
  private streamManager = new StreamManager();

  constructor() {
    super();
    this.ensureSessionsDir();
    this.setupStreamEventForwarding();
  }

  /**
   * Forward all stream events from StreamManager to AIService consumers
   */
  private setupStreamEventForwarding(): void {
    this.streamManager.on("stream-start", (data) => this.emit("stream-start", data));
    this.streamManager.on("stream-delta", (data) => this.emit("stream-delta", data));
    this.streamManager.on("stream-end", (data) => this.emit("stream-end", data));
    this.streamManager.on("stream-abort", (data) => this.emit("stream-abort", data));
    this.streamManager.on("error", (data) => this.emit("error", data));
  }

  private async ensureSessionsDir(): Promise<void> {
    try {
      await fs.mkdir(SESSIONS_DIR, { recursive: true });
    } catch (error) {
      safeLogError("Failed to create sessions directory:", error);
    }
  }

  private getChatHistoryPath(workspaceId: string): string {
    return path.join(getSessionDir(workspaceId), this.CHAT_FILE);
  }

  private getMetadataPath(workspaceId: string): string {
    return path.join(getSessionDir(workspaceId), this.METADATA_FILE);
  }

  async getWorkspaceMetadata(workspaceId: string): Promise<Result<WorkspaceMetadata>> {
    try {
      const metadataPath = this.getMetadataPath(workspaceId);
      const data = await fs.readFile(metadataPath, "utf-8");
      return Ok(JSON.parse(data));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        // Create default metadata if it doesn't exist
        const defaultMetadata: WorkspaceMetadata = {
          id: workspaceId,
          projectName: workspaceId.split("-")[0] || "unknown",
        };
        await this.saveWorkspaceMetadata(workspaceId, defaultMetadata);
        return Ok(defaultMetadata);
      }
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to read workspace metadata: ${message}`);
    }
  }

  async saveWorkspaceMetadata(
    workspaceId: string,
    metadata: WorkspaceMetadata
  ): Promise<Result<void>> {
    try {
      const workspaceDir = getSessionDir(workspaceId);
      await fs.mkdir(workspaceDir, { recursive: true });
      const metadataPath = this.getMetadataPath(workspaceId);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to save workspace metadata: ${message}`);
    }
  }

  async getHistory(workspaceId: string): Promise<Result<CmuxMessage[]>> {
    try {
      const historyPath = this.getChatHistoryPath(workspaceId);
      const data = await fs.readFile(historyPath, "utf-8");
      const messages = data
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as CmuxMessage);
      return Ok(messages);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return Ok([]); // No history yet
      }
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to read history: ${message}`);
    }
  }

  async appendToHistory(workspaceId: string, message: CmuxMessage): Promise<Result<void>> {
    try {
      const workspaceDir = getSessionDir(workspaceId);
      await fs.mkdir(workspaceDir, { recursive: true });
      const historyPath = this.getChatHistoryPath(workspaceId);

      // Store the message with workspace context
      const historyEntry = {
        ...message,
        workspaceId,
      };

      await fs.appendFile(historyPath, JSON.stringify(historyEntry) + "\n");
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to append to history: ${message}`);
    }
  }

  async clearHistory(workspaceId: string): Promise<Result<void>> {
    try {
      const historyPath = this.getChatHistoryPath(workspaceId);
      await fs.unlink(historyPath);
      return Ok(undefined);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return Ok(undefined); // Already cleared
      }
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to clear history: ${message}`);
    }
  }

  /**
   * Stream a message conversation to the AI model
   * @param messages Array of conversation messages
   * @param workspaceId Unique identifier for the workspace
   * @param abortSignal Optional signal to abort the stream
   * @returns Promise that resolves when streaming completes or fails
   */
  async streamMessage(
    messages: CmuxMessage[],
    workspaceId: string,
    abortSignal?: AbortSignal
  ): Promise<Result<void>> {
    try {
      // Convert CmuxMessage to ModelMessage format using Vercel AI SDK utility
      const modelMessages = convertToModelMessages(messages);

      // Delegate to StreamManager (handles all safety and lifecycle)
      const streamResult = await this.streamManager.startStream(
        workspaceId,
        modelMessages,
        abortSignal
      );

      if (!streamResult.success) {
        return streamResult;
      }

      // Listen for stream-end events to save messages to history
      this.streamManager.once("stream-end", async (data: StreamEndEvent) => {
        if (data.workspaceId === workspaceId) {
          const assistantMessage = createCmuxMessage(
            data.messageId,
            "assistant",
            data.content || "",
            {
              sequenceNumber: messages.length,
              tokens: data.usage?.totalTokens,
              timestamp: Date.now(),
            }
          );

          await this.appendToHistory(workspaceId, assistantMessage);
        }
      });

      return Ok(undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      safeLogError("Stream message error:", error);
      return Err(`Failed to stream message: ${errorMessage}`);
    }
  }

  async stopStream(workspaceId: string): Promise<Result<void>> {
    return this.streamManager.stopStream(workspaceId);
  }

  /**
   * Check if a workspace is currently streaming
   */
  isStreaming(workspaceId: string): boolean {
    return this.streamManager.isStreaming(workspaceId);
  }

  /**
   * Get the current stream state for a workspace
   */
  getStreamState(workspaceId: string): string {
    return this.streamManager.getStreamState(workspaceId);
  }

  async deleteWorkspace(workspaceId: string): Promise<Result<void>> {
    try {
      const workspaceDir = getSessionDir(workspaceId);
      await fs.rm(workspaceDir, { recursive: true, force: true });
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to delete workspace: ${message}`);
    }
  }
}

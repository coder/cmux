import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, convertToModelMessages } from "ai";
import { Result, Ok, Err } from "../types/result";
import { WorkspaceMetadata } from "../types/workspace";
import { CmuxMessage, createCmuxMessage } from "../types/message";

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
  private sessionsDir: string;
  private readonly CHAT_FILE = "chat.jsonl";
  private readonly METADATA_FILE = "metadata.json";
  private model = anthropic("claude-opus-4-1");
  private activeStreams = new Map<string, Awaited<ReturnType<typeof streamText>>>();

  constructor() {
    super();
    this.sessionsDir = path.join(os.homedir(), ".cmux", "sessions");
    this.ensureSessionsDir();
  }

  private async ensureSessionsDir(): Promise<void> {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      safeLogError("Failed to create sessions directory:", error);
    }
  }

  private getWorkspaceDir(workspaceId: string): string {
    return path.join(this.sessionsDir, workspaceId);
  }

  private getChatHistoryPath(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), this.CHAT_FILE);
  }

  private getMetadataPath(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), this.METADATA_FILE);
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
      const workspaceDir = this.getWorkspaceDir(workspaceId);
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
      const workspaceDir = this.getWorkspaceDir(workspaceId);
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

      // Start streaming
      const result = streamText({
        model: this.model,
        messages: modelMessages,
        abortSignal,
      });

      // Store the stream for this workspace
      this.activeStreams.set(workspaceId, result);

      // Create message ID for the assistant response
      const messageId = `assistant-${Date.now()}`;

      // Emit stream start event
      this.emit("stream-start", {
        type: "stream-start",
        workspaceId,
        messageId,
      });

      // Stream the text
      let fullContent = "";
      for await (const chunk of result.textStream) {
        fullContent += chunk;
        this.emit("stream-delta", {
          type: "stream-delta",
          workspaceId,
          messageId,
          delta: chunk,
        });
      }

      // Get usage information
      const usage = await result.usage;

      // Emit stream end event
      this.emit("stream-end", {
        type: "stream-end",
        workspaceId,
        messageId,
        content: fullContent,
        usage,
      });

      // Save the complete message to history
      const assistantMessage = createCmuxMessage(messageId, "assistant", fullContent, {
        sequenceNumber: messages.length,
        tokens: usage?.totalTokens,
        timestamp: Date.now(),
      });

      await this.appendToHistory(workspaceId, assistantMessage);

      // Clean up stream
      this.activeStreams.delete(workspaceId);

      return Ok(undefined);
    } catch (error) {
      safeLogError("Stream message error:", error);

      // Clean up stream on error
      this.activeStreams.delete(workspaceId);

      // Categorize error types for better handling
      let errorType = "unknown";
      let errorMessage = "Unknown error occurred";

      if (error instanceof Error) {
        errorMessage = error.message;

        // Categorize common error types
        if (error.name === "AbortError" || errorMessage.includes("abort")) {
          errorType = "aborted";
          errorMessage = "Stream was aborted";
        } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
          errorType = "network";
          errorMessage = "Network error while streaming";
        } else if (errorMessage.includes("token") || errorMessage.includes("limit")) {
          errorType = "quota";
          errorMessage = "Token limit or quota exceeded";
        } else if (errorMessage.includes("auth") || errorMessage.includes("key")) {
          errorType = "authentication";
          errorMessage = "Authentication failed";
        } else {
          errorType = "api";
        }
      }

      this.emit("error", {
        type: "error",
        workspaceId,
        error: errorMessage,
        errorType,
      });

      return Err(`Failed to stream message: ${errorMessage}`);
    }
  }

  async stopStream(workspaceId: string): Promise<Result<void>> {
    try {
      const stream = this.activeStreams.get(workspaceId);
      if (stream) {
        // The stream will be aborted via the AbortSignal passed to streamText
        // We just need to clean up our reference
        this.activeStreams.delete(workspaceId);

        // Emit an abort event for consistency
        this.emit("stream-abort", {
          type: "stream-abort",
          workspaceId,
        });
      }
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to stop stream: ${message}`);
    }
  }

  async deleteWorkspace(workspaceId: string): Promise<Result<void>> {
    try {
      const workspaceDir = this.getWorkspaceDir(workspaceId);
      await fs.rm(workspaceDir, { recursive: true, force: true });
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to delete workspace: ${message}`);
    }
  }
}

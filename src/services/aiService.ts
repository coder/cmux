import * as fs from "fs/promises";
import * as path from "path";
import { EventEmitter } from "events";
import { convertToModelMessages, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { Result, Ok, Err } from "../types/result";
import { WorkspaceMetadata } from "../types/workspace";
import { CmuxMessage } from "../types/message";
import { SESSIONS_DIR, getSessionDir, loadProvidersConfig } from "../config";
import { StreamManager } from "./streamManager";
import type { StreamEndEvent } from "../types/aiEvents";
import type { SendMessageError } from "../types/errors";
import { getToolsForModel } from "../utils/tools";
import { log } from "./log";
import {
  transformModelMessages,
  validateAnthropicCompliance,
} from "../utils/modelMessageTransform";

// Export a standalone version of getToolsForModel for use in backend

export class AIService extends EventEmitter {
  private readonly CHAT_FILE = "chat.jsonl";
  private readonly METADATA_FILE = "metadata.json";
  private streamManager = new StreamManager();
  private defaultModel = "anthropic:claude-opus-4-1"; // Default model string

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
    // Forward tool events
    this.streamManager.on("tool-call-start", (data) => this.emit("tool-call-start", data));
    this.streamManager.on("tool-call-delta", (data) => this.emit("tool-call-delta", data));
    this.streamManager.on("tool-call-end", (data) => this.emit("tool-call-end", data));
  }

  private async ensureSessionsDir(): Promise<void> {
    try {
      await fs.mkdir(SESSIONS_DIR, { recursive: true });
    } catch (error) {
      log.error("Failed to create sessions directory:", error);
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
        // If metadata doesn't exist, we cannot create valid defaults without the workspace path
        // The workspace path must be provided when the workspace is created
        return Err(
          `Workspace metadata not found for ${workspaceId}. Workspace may not be properly initialized.`
        );
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
   * Split assistant messages that have text after tool calls with results.

  /**
   * Create an AI SDK model from a model string (e.g., "anthropic:claude-opus-4-1")
   *
   * IMPORTANT: We ONLY use providers.jsonc as the single source of truth for provider configuration.
   * We DO NOT use environment variables or default constructors that might read them.
   * This ensures consistent, predictable configuration management.
   *
   * Provider configuration from providers.jsonc is passed verbatim to the provider
   * constructor, ensuring automatic parity with Vercel AI SDK - any configuration options
   * supported by the provider will work without modification.
   */
  private async createModel(modelString: string): Promise<Result<LanguageModel, SendMessageError>> {
    try {
      // Parse model string (format: "provider:model-id")
      const [providerName, modelId] = modelString.split(":");

      if (!providerName || !modelId) {
        return Err({
          type: "invalid_model_string",
          message: `Invalid model string format: "${modelString}". Expected "provider:model-id"`,
        });
      }

      // Load providers configuration - the ONLY source of truth
      const providersConfig = loadProvidersConfig();
      const providerConfig = providersConfig?.[providerName];

      if (!providerConfig) {
        return Err({
          type: "provider_not_configured",
          provider: providerName,
        });
      }

      // Handle Anthropic provider
      if (providerName === "anthropic") {
        // Check for API key in config
        if (!providerConfig.apiKey) {
          return Err({
            type: "api_key_not_found",
            provider: providerName,
          });
        }

        // Pass configuration verbatim to the provider, ensuring parity with Vercel AI SDK
        const provider = createAnthropic(providerConfig);
        return Ok(provider(modelId));
      }

      // Add support for other providers here in the future
      // if (providerName === "openai") { ... }

      return Err({
        type: "provider_not_configured",
        provider: providerName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return Err({ type: "unknown", raw: `Failed to create model: ${errorMessage}` });
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
  ): Promise<Result<void, SendMessageError>> {
    try {
      // Create model instance with early API key validation
      const modelResult = await this.createModel(this.defaultModel);
      if (!modelResult.success) {
        return Err(modelResult.error);
      }

      // Dump original messages for debugging
      log.debug_obj(`${workspaceId}/1_original_messages.json`, messages);

      // Convert CmuxMessage to ModelMessage format using Vercel AI SDK utility
      const modelMessages = convertToModelMessages(messages);

      log.debug_obj(`${workspaceId}/2_model_messages.json`, modelMessages);

      // Apply ModelMessage transforms to ensure Anthropic API compliance
      const finalMessages = transformModelMessages(modelMessages);

      log.debug_obj(`${workspaceId}/3_final_messages.json`, finalMessages);

      // Validate the messages meet Anthropic requirements
      const validation = validateAnthropicCompliance(finalMessages);
      if (!validation.valid) {
        log.error(`Anthropic compliance validation failed: ${validation.error}`);
        // Continue anyway, as the API might be more lenient
      }

      // Get workspace metadata to retrieve workspace path
      const metadataResult = await this.getWorkspaceMetadata(workspaceId);
      const workspacePath = metadataResult.success
        ? metadataResult.data.workspacePath
        : process.cwd(); // Fallback to current working directory if metadata is missing

      // Get model-specific tools with workspace path configuration
      const tools = getToolsForModel(this.defaultModel, { cwd: workspacePath });

      // Delegate to StreamManager with model instance and tools
      const streamResult = await this.streamManager.startStream(
        workspaceId,
        finalMessages,
        modelResult.data,
        this.defaultModel,
        abortSignal,
        tools
      );

      if (!streamResult.success) {
        // StreamManager already returns SendMessageError
        return Err(streamResult.error);
      }

      // Listen for stream-end events to save messages to history
      this.streamManager.once("stream-end", async (data: StreamEndEvent) => {
        if (data.workspaceId === workspaceId) {
          // Create assistant message with parts array preserving temporal ordering
          // Metadata flows transparently from backend event
          const assistantMessage: CmuxMessage = {
            id: data.messageId,
            role: "assistant",
            metadata: {
              sequenceNumber: messages.length,
              ...data.metadata,
              timestamp: Date.now(),
            },
            parts: data.parts,
          };

          // Only save if there are parts (text or tool calls)
          if (data.parts && data.parts.length > 0) {
            await this.appendToHistory(workspaceId, assistantMessage);
          }
          log.info("stream end usage:", data.metadata.usage);
        }
      });

      return Ok(undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error("Stream message error:", error);
      // Return as unknown error type
      return Err({ type: "unknown", raw: `Failed to stream message: ${errorMessage}` });
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

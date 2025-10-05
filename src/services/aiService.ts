import * as fs from "fs/promises";
import * as path from "path";
import { EventEmitter } from "events";
import { convertToModelMessages, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { Result } from "../types/result";
import { Ok, Err } from "../types/result";
import type { WorkspaceMetadata } from "../types/workspace";
import { WorkspaceMetadataSchema } from "../types/workspace";
import type { CmuxMessage } from "../types/message";
import { createCmuxMessage } from "../types/message";
import type { Config } from "../config";
import { StreamManager } from "./streamManager";
import type { SendMessageError } from "../types/errors";
import { getToolsForModel } from "../utils/tools";
import { log } from "./log";
import {
  transformModelMessages,
  validateAnthropicCompliance,
  addInterruptedSentinel,
  filterEmptyAssistantMessages,
} from "../utils/modelMessageTransform";
import { applyCacheControl } from "../utils/cacheStrategy";
import type { HistoryService } from "./historyService";
import type { PartialService } from "./partialService";
import { buildSystemMessage } from "./systemMessage";
import { getTokenizerForModel } from "../utils/tokenizer";
import { buildProviderOptions } from "../utils/providerOptions";
import type { ThinkingLevel } from "../types/thinking";
import { createOpenAI } from "@ai-sdk/openai";
import type { StreamAbortEvent } from "../types/stream";

// Export a standalone version of getToolsForModel for use in backend

export class AIService extends EventEmitter {
  private readonly METADATA_FILE = "metadata.json";
  private readonly streamManager: StreamManager;
  private readonly historyService: HistoryService;
  private readonly partialService: PartialService;
  private readonly config: Config;

  constructor(config: Config, historyService: HistoryService, partialService: PartialService) {
    super();
    this.config = config;
    this.historyService = historyService;
    this.partialService = partialService;
    this.streamManager = new StreamManager(historyService, partialService);
    void this.ensureSessionsDir();
    this.setupStreamEventForwarding();
  }

  /**
   * Forward all stream events from StreamManager to AIService consumers
   */
  private setupStreamEventForwarding(): void {
    this.streamManager.on("stream-start", (data) => this.emit("stream-start", data));
    this.streamManager.on("stream-delta", (data) => this.emit("stream-delta", data));
    this.streamManager.on("stream-end", (data) => this.emit("stream-end", data));

    // Handle stream-abort: commit partial to history before forwarding
    this.streamManager.on("stream-abort", (data: StreamAbortEvent) => {
      void (async () => {
        // Commit interrupted message to history with partial:true metadata
        // This ensures /clear and /truncate can clean up interrupted messages
        await this.partialService.commitToHistory(data.workspaceId);
        await this.partialService.deletePartial(data.workspaceId);

        // Forward abort event to consumers
        this.emit("stream-abort", data);
      })();
    });

    this.streamManager.on("error", (data) => this.emit("error", data));
    // Forward tool events
    this.streamManager.on("tool-call-start", (data) => this.emit("tool-call-start", data));
    this.streamManager.on("tool-call-delta", (data) => this.emit("tool-call-delta", data));
    this.streamManager.on("tool-call-end", (data) => this.emit("tool-call-end", data));
    // Forward reasoning events
    this.streamManager.on("reasoning-delta", (data) => this.emit("reasoning-delta", data));
    this.streamManager.on("reasoning-end", (data) => this.emit("reasoning-end", data));
  }

  private async ensureSessionsDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.sessionsDir, { recursive: true });
    } catch (error) {
      log.error("Failed to create sessions directory:", error);
    }
  }

  private getMetadataPath(workspaceId: string): string {
    return path.join(this.config.getSessionDir(workspaceId), this.METADATA_FILE);
  }

  async getWorkspaceMetadata(workspaceId: string): Promise<Result<WorkspaceMetadata>> {
    try {
      const metadataPath = this.getMetadataPath(workspaceId);
      const data = await fs.readFile(metadataPath, "utf-8");

      // Parse and validate with Zod schema (handles any type safely)
      const validated = WorkspaceMetadataSchema.parse(JSON.parse(data));

      return Ok(validated);
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
      const workspaceDir = this.config.getSessionDir(workspaceId);
      await fs.mkdir(workspaceDir, { recursive: true });
      const metadataPath = this.getMetadataPath(workspaceId);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to save workspace metadata: ${message}`);
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
  private createModel(modelString: string): Result<LanguageModel, SendMessageError> {
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
      const providersConfig = this.config.loadProvidersConfig();
      const providerConfig = providersConfig?.[providerName] ?? {};

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

      // Handle OpenAI provider (using Responses API)
      if (providerName === "openai") {
        if (!providerConfig.apiKey) {
          return Err({
            type: "api_key_not_found",
            provider: providerName,
          });
        }
        const provider = createOpenAI(providerConfig);
        // Use Responses API for persistence and built-in tools
        return Ok(provider.responses(modelId));
      }

      return Err({
        type: "provider_not_supported",
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
   * @param modelString Model string (e.g., "anthropic:claude-opus-4-1") - required from frontend
   * @param thinkingLevel Optional thinking/reasoning level for AI models
   * @param abortSignal Optional signal to abort the stream
   * @returns Promise that resolves when streaming completes or fails
   */
  async streamMessage(
    messages: CmuxMessage[],
    workspaceId: string,
    modelString: string,
    thinkingLevel?: ThinkingLevel,
    abortSignal?: AbortSignal
  ): Promise<Result<void, SendMessageError>> {
    try {
      // DEBUG: Log streamMessage call
      const lastMessage = messages[messages.length - 1];
      log.debug(
        `[STREAM MESSAGE] workspaceId=${workspaceId} messageCount=${messages.length} lastRole=${lastMessage?.role}`
      );

      // Before starting a new stream, commit any existing partial to history
      // This is idempotent - won't double-commit if already in chat.jsonl
      await this.partialService.commitToHistory(workspaceId);

      // Create model instance with early API key validation
      const modelResult = this.createModel(modelString);
      if (!modelResult.success) {
        return Err(modelResult.error);
      }

      // Dump original messages for debugging
      log.debug_obj(`${workspaceId}/1_original_messages.json`, messages);

      // Filter out assistant messages with only reasoning (no text/tools)
      const filteredMessages = filterEmptyAssistantMessages(messages);
      log.debug(`Filtered ${messages.length - filteredMessages.length} empty assistant messages`);
      log.debug_obj(`${workspaceId}/1a_filtered_messages.json`, filteredMessages);

      // Add [INTERRUPTED] sentinel to partial messages (for model context)
      const messagesWithSentinel = addInterruptedSentinel(filteredMessages);

      // Convert CmuxMessage to ModelMessage format using Vercel AI SDK utility
      // Type assertion needed because CmuxMessage has custom tool parts for interrupted tools
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const modelMessages = convertToModelMessages(messagesWithSentinel as any);

      log.debug_obj(`${workspaceId}/2_model_messages.json`, modelMessages);

      // Extract provider name from modelString (e.g., "anthropic:claude-opus-4-1" -> "anthropic")
      const [providerName] = modelString.split(":");

      // Apply ModelMessage transforms based on provider requirements
      const transformedMessages = transformModelMessages(modelMessages, providerName);

      // Apply cache control for Anthropic models AFTER transformation
      const finalMessages = applyCacheControl(transformedMessages, modelString);

      log.debug_obj(`${workspaceId}/3_final_messages.json`, finalMessages);

      // Validate the messages meet Anthropic requirements (Anthropic only)
      if (providerName === "anthropic") {
        const validation = validateAnthropicCompliance(finalMessages);
        if (!validation.valid) {
          log.error(`Anthropic compliance validation failed: ${validation.error}`);
          // Continue anyway, as the API might be more lenient
        }
      }

      // Get workspace metadata to retrieve workspace path
      const metadataResult = await this.getWorkspaceMetadata(workspaceId);
      if (!metadataResult.success) {
        return Err({ type: "unknown", raw: metadataResult.error });
      }

      // Build system message from workspace metadata
      const systemMessage = await buildSystemMessage(metadataResult.data);

      // Count system message tokens for cost tracking
      const tokenizer = getTokenizerForModel(modelString);
      const systemMessageTokens = tokenizer.countTokens(systemMessage);

      const workspacePath = metadataResult.data.workspacePath;

      // Get model-specific tools with workspace path configuration
      const tools = getToolsForModel(modelString, { cwd: workspacePath });

      // Create assistant message placeholder with historySequence from backend
      const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const assistantMessage = createCmuxMessage(assistantMessageId, "assistant", "", {
        timestamp: Date.now(),
        model: modelString,
        systemMessageTokens,
      });

      // Append to history to get historySequence assigned
      const appendResult = await this.historyService.appendToHistory(workspaceId, assistantMessage);
      if (!appendResult.success) {
        return Err({ type: "unknown", raw: appendResult.error });
      }

      // Get the assigned historySequence
      const historySequence = assistantMessage.metadata?.historySequence ?? 0;

      // Build provider options based on thinking level and message history
      // Pass filtered messages so OpenAI can extract previousResponseId for persistence
      const providerOptions = buildProviderOptions(
        modelString,
        thinkingLevel ?? "off",
        filteredMessages
      );

      // Delegate to StreamManager with model instance, system message, tools, historySequence, and initial metadata
      const streamResult = await this.streamManager.startStream(
        workspaceId,
        finalMessages,
        modelResult.data,
        modelString,
        historySequence,
        systemMessage,
        abortSignal,
        tools,
        {
          systemMessageTokens,
          timestamp: Date.now(),
        },
        providerOptions
      );

      if (!streamResult.success) {
        // StreamManager already returns SendMessageError
        return Err(streamResult.error);
      }

      // StreamManager now handles history updates directly on stream-end
      // No need for event listener here
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

  /**
   * Get the current stream info for a workspace if actively streaming
   * Used to re-establish streaming context on frontend reconnection
   */
  getStreamInfo(workspaceId: string): ReturnType<typeof this.streamManager.getStreamInfo> {
    return this.streamManager.getStreamInfo(workspaceId);
  }

  /**
   * Replay stream events
   * Emits the same events that would be emitted during live streaming
   */
  replayStream(workspaceId: string): void {
    this.streamManager.replayStream(workspaceId);
  }

  async deleteWorkspace(workspaceId: string): Promise<Result<void>> {
    try {
      const workspaceDir = this.config.getSessionDir(workspaceId);
      await fs.rm(workspaceDir, { recursive: true, force: true });
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to delete workspace: ${message}`);
    }
  }
}

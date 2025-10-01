import * as fs from "fs/promises";
import * as path from "path";
import { EventEmitter } from "events";
import { convertToModelMessages, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Result, Ok, Err } from "../types/result";
import { WorkspaceMetadata, WorkspaceMetadataSchema } from "../types/workspace";
import { CmuxMessage, createCmuxMessage } from "../types/message";
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
import { applyCacheControl } from "../utils/cacheStrategy";
import { HistoryService } from "./historyService";
import { buildSystemMessage } from "./systemMessage";
import { getTokenizerForModel } from "../utils/tokenizer";
import { buildProviderOptions } from "../utils/providerOptions";
import { ThinkingLevel } from "../types/thinking";
import { DEFAULT_MODEL } from "../constants/models";
import { getProviderAdapter } from "./providerAdapters";

// Export a standalone version of getToolsForModel for use in backend

export class AIService extends EventEmitter {
  private readonly METADATA_FILE = "metadata.json";
  private streamManager = new StreamManager();
  private readonly defaultModel = DEFAULT_MODEL; // Default model string
  private historyService: HistoryService;

  constructor(historyService: HistoryService) {
    super();
    this.historyService = historyService;
    this.ensureSessionsDir();
    this.setupStreamEventForwarding();
  }

  getDefaultModel(): string {
    return this.defaultModel;
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
    // Forward reasoning events
    this.streamManager.on("reasoning-delta", (data) => this.emit("reasoning-delta", data));
    this.streamManager.on("reasoning-end", (data) => this.emit("reasoning-end", data));
  }

  private async ensureSessionsDir(): Promise<void> {
    try {
      await fs.mkdir(SESSIONS_DIR, { recursive: true });
    } catch (error) {
      log.error("Failed to create sessions directory:", error);
    }
  }

  private getMetadataPath(workspaceId: string): string {
    return path.join(getSessionDir(workspaceId), this.METADATA_FILE);
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

  async setWorkspaceModel(workspaceId: string, model: string): Promise<Result<void>> {
    const metadataResult = await this.getWorkspaceMetadata(workspaceId);
    if (!metadataResult.success) {
      return Err(metadataResult.error);
    }

    const normalizedModel = model.trim();
    if (!normalizedModel) {
      return Err("Model cannot be empty");
    }

    const updatedMetadata: WorkspaceMetadata = {
      ...metadataResult.data,
      model: normalizedModel,
    };

    return this.saveWorkspaceMetadata(workspaceId, updatedMetadata);
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
      const adapter = getProviderAdapter(providerName);

      if (!adapter) {
        return Err({
          type: "provider_not_configured",
          provider: providerName,
        });
      }

      const validation = adapter.validate(providerName, providersConfig?.[providerName]);
      if (!validation.success) {
        return Err(validation.error);
      }

      const providerConfig = validation.data;
      const provider = adapter.instantiate(providerConfig, modelId);
      return Ok(provider);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return Err({ type: "unknown", raw: `Failed to create model: ${errorMessage}` });
    }
  }

  /**
   * Stream a message conversation to the AI model
   * @param messages Array of conversation messages
   * @param workspaceId Unique identifier for the workspace
   * @param thinkingLevel Optional thinking/reasoning level for AI models
   * @param abortSignal Optional signal to abort the stream
   * @returns Promise that resolves when streaming completes or fails
   */
  async streamMessage(
    messages: CmuxMessage[],
    workspaceId: string,
    thinkingLevel?: ThinkingLevel,
    abortSignal?: AbortSignal
  ): Promise<Result<void, SendMessageError>> {
    try {
      const metadataResult = await this.getWorkspaceMetadata(workspaceId);
      if (!metadataResult.success) {
        return Err({ type: "unknown", raw: metadataResult.error });
      }

      const workspaceMetadata = metadataResult.data;
      const configuredModel = workspaceMetadata.model?.trim();
      const modelString = configuredModel && configuredModel.length > 0 ? configuredModel : this.defaultModel;

      // Create model instance with early API key validation
      const modelResult = await this.createModel(modelString);
      if (!modelResult.success) {
        return Err(modelResult.error);
      }

      // Dump original messages for debugging
      log.debug_obj(`${workspaceId}/1_original_messages.json`, messages);

      // Convert CmuxMessage to ModelMessage format using Vercel AI SDK utility
      const modelMessages = convertToModelMessages(messages);

      log.debug_obj(`${workspaceId}/2_model_messages.json`, modelMessages);

      // Apply ModelMessage transforms to ensure Anthropic API compliance
      const transformedMessages = transformModelMessages(modelMessages);

      // Apply cache control for Anthropic models AFTER transformation
      const finalMessages = applyCacheControl(transformedMessages, modelString);

      log.debug_obj(`${workspaceId}/3_final_messages.json`, finalMessages);

      // Validate the messages meet Anthropic requirements
      const validation = validateAnthropicCompliance(finalMessages);
      if (!validation.valid) {
        log.error(`Anthropic compliance validation failed: ${validation.error}`);
        // Continue anyway, as the API might be more lenient
      }

      // Build system message from workspace metadata
      const systemMessage = await buildSystemMessage(workspaceMetadata);

      // Count system message tokens for cost tracking
      const tokenizer = getTokenizerForModel(modelString);
      const systemMessageTokens = await tokenizer.countTokens(systemMessage);

      const workspacePath = workspaceMetadata.workspacePath;

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

      // Build provider options based on thinking level
      const providerOptions = buildProviderOptions(modelString, thinkingLevel || "off");

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

      // Listen for stream-end events to update placeholder with final message
      // Note: We UPDATE the placeholder (line 221) instead of appending to avoid duplicates
      this.streamManager.once("stream-end", async (data: StreamEndEvent) => {
        if (data.workspaceId === workspaceId) {
          // Create assistant message with parts array preserving temporal ordering
          // Metadata is complete from StreamManager (includes systemMessageTokens, usage, etc)
          const finalAssistantMessage: CmuxMessage = {
            id: data.messageId,
            role: "assistant",
            metadata: {
              ...data.metadata,
              historySequence, // Reuse sequence number from placeholder to maintain message order
            },
            parts: data.parts,
          };

          // Only update if there are parts (text or tool calls)
          if (data.parts && data.parts.length > 0) {
            // UPDATE replaces placeholder in place, preventing duplicate sequence numbers
            await this.historyService.updateHistory(workspaceId, finalAssistantMessage);
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

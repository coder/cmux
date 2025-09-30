import * as fs from "fs/promises";
import * as path from "path";
import { EventEmitter } from "events";
import { convertToModelMessages, type LanguageModel, type Tool } from "ai";
import { createAnthropic, anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { Result, Ok, Err } from "../types/result";
import { WorkspaceMetadata } from "../types/workspace";
import { CmuxMessage } from "../types/message";
import { SESSIONS_DIR, getSessionDir, loadProvidersConfig } from "../config";
import { StreamManager } from "./streamManager";
import type { StreamEndEvent } from "../types/aiEvents";
import type { SendMessageError } from "../types/errors";
import { readFileTool } from "./tools/readFile";
import { bashTool } from "./tools/bash";
import { log } from "./log";
import { getAvailableTools } from "../utils/toolDefinitions";

// Export a standalone version of getToolsForModel for use in backend
export function getToolsForModel(modelString: string): Record<string, Tool> {
  const [provider, modelId] = modelString.split(":");

  // Base tools available for all models
  const baseTools: Record<string, Tool> = {
    // Use snake_case for tool names to match what seems to be the convention.
    read_file: readFileTool,
    bash: bashTool,
  };

  // Try to add provider-specific web search tools if available
  // This doesn't break if the provider isn't recognized
  try {
    switch (provider) {
      case "anthropic":
        return {
          ...baseTools,
          web_search: anthropic.tools.webSearch_20250305({ maxUses: 10 }),
        };

      case "openai":
        // Only add web search for models that support it
        if (modelId.includes("gpt-5") || modelId.includes("gpt-4")) {
          return {
            ...baseTools,
            web_search: openai.tools.webSearch({}),
          };
        }
        break;

      case "google":
        return {
          ...baseTools,
          google_search: google.tools.googleSearch({}),
        };
    }
  } catch (error) {
    // If tools aren't available, just return base tools
    log.error(`No web search tools available for ${provider}:`, error);
  }

  return baseTools;
}

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
   * Get tools for a model based on the provider and model ID.
   * This method delegates to the standalone function for consistency.
   *
   * @param modelString The model string in format "provider:model-id"
   * @returns Record of tools available for the model
   */
  private getToolsForModel(modelString: string): Record<string, Tool> {
    return getToolsForModel(modelString);
  }

  /**
   * Split assistant messages that have text after tool calls.
   *
   * Anthropic's API requires that tool_result blocks immediately follow tool_use blocks.
   * When an assistant message has text after a tool call, convertToModelMessages places
   * the tool result after ALL the assistant content, violating this requirement.
   *
   * This transform splits such messages into:
   * 1. Assistant message with text-before + tool calls
   * 2. Assistant continuation message with text-after
   *
   * This ensures the converted format will be:
   * - Assistant: [text, tool-call]
   * - Tool: [tool-result]  <- immediately after tool-call
   * - Assistant: [text-after]  <- continuation in separate message
   */
  private splitTextAfterTools(messages: CmuxMessage[]): CmuxMessage[] {
    const result: CmuxMessage[] = [];

    for (const msg of messages) {
      if (msg.role !== "assistant") {
        result.push(msg);
        continue;
      }

      // Find last tool index
      let lastToolIndex = -1;
      for (let i = msg.parts.length - 1; i >= 0; i--) {
        if (msg.parts[i].type === "dynamic-tool") {
          lastToolIndex = i;
          break;
        }
      }

      // If no tools or no text after tools, keep as-is
      if (lastToolIndex === -1 || lastToolIndex === msg.parts.length - 1) {
        result.push(msg);
        continue;
      }

      // Check if there's actually text content after the last tool
      const partsAfter = msg.parts.slice(lastToolIndex + 1);
      const hasTextAfter = partsAfter.some(
        (p) => p.type === "text" && p.text && p.text.trim().length > 0
      );

      if (!hasTextAfter) {
        result.push(msg);
        continue;
      }

      // Split: message with text+tools, then continuation with text-after
      result.push({
        ...msg,
        parts: msg.parts.slice(0, lastToolIndex + 1),
      });

      result.push({
        ...msg,
        id: msg.id + "-continuation",
        parts: partsAfter,
      });
    }

    return result;
  }

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

      // Transform messages to handle Anthropic's requirement that tool results
      // must immediately follow tool calls (no text between them)
      const transformedMessages = this.splitTextAfterTools(messages);

      // Convert CmuxMessage to ModelMessage format using Vercel AI SDK utility
      const modelMessages = convertToModelMessages(transformedMessages);

      // Get model-specific tools (including provider-specific web search if available)
      const tools = this.getToolsForModel(this.defaultModel);

      // Delegate to StreamManager with model instance and tools
      const streamResult = await this.streamManager.startStream(
        workspaceId,
        modelMessages,
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
          const assistantMessage: CmuxMessage = {
            id: data.messageId,
            role: "assistant",
            metadata: {
              sequenceNumber: messages.length,
              tokens: data.usage?.totalTokens,
              usage: data.usage,
              timestamp: Date.now(),
              model: data.model,
            },
            parts: data.parts,
          };

          // Only save if there are parts (text or tool calls)
          if (data.parts && data.parts.length > 0) {
            await this.appendToHistory(workspaceId, assistantMessage);
          }
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

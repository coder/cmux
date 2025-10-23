import assert from "@/utils/assert";
import { EventEmitter } from "events";
import * as path from "path";
import { createCmuxMessage } from "@/types/message";
import type { Config } from "@/config";
import type { AIService } from "@/services/aiService";
import type { HistoryService } from "@/services/historyService";
import type { PartialService } from "@/services/partialService";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceChatMessage, StreamErrorMessage, SendMessageOptions } from "@/types/ipc";
import type { SendMessageError } from "@/types/errors";
import { createUnknownSendMessageError } from "@/services/utils/sendMessageError";
import type { Result } from "@/types/result";
import { Ok, Err } from "@/types/result";
import { enforceThinkingPolicy } from "@/utils/thinking/policy";
import { loadTokenizerForModel } from "@/utils/main/tokenizer";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateWorkspaceTitle } from "@/services/autotitle";

interface ImagePart {
  url: string;
  mediaType: string;
}

export interface AgentSessionChatEvent {
  workspaceId: string;
  message: WorkspaceChatMessage;
}

export interface AgentSessionMetadataEvent {
  workspaceId: string;
  metadata: WorkspaceMetadata | null;
}

interface AgentSessionOptions {
  workspaceId: string;
  config: Config;
  historyService: HistoryService;
  partialService: PartialService;
  aiService: AIService;
}

export class AgentSession {
  private readonly workspaceId: string;
  private readonly config: Config;
  private readonly historyService: HistoryService;
  private readonly partialService: PartialService;
  private readonly aiService: AIService;
  private readonly emitter = new EventEmitter();
  private readonly aiListeners: Array<{ event: string; handler: (...args: unknown[]) => void }> =
    [];
  private disposed = false;

  constructor(options: AgentSessionOptions) {
    assert(options, "AgentSession requires options");
    const { workspaceId, config, historyService, partialService, aiService } = options;

    assert(typeof workspaceId === "string", "workspaceId must be a string");
    const trimmedWorkspaceId = workspaceId.trim();
    assert(trimmedWorkspaceId.length > 0, "workspaceId must not be empty");

    this.workspaceId = trimmedWorkspaceId;
    this.config = config;
    this.historyService = historyService;
    this.partialService = partialService;
    this.aiService = aiService;

    this.attachAiListeners();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const { event, handler } of this.aiListeners) {
      this.aiService.off(event, handler as never);
    }
    this.aiListeners.length = 0;
    this.emitter.removeAllListeners();
  }

  onChatEvent(listener: (event: AgentSessionChatEvent) => void): () => void {
    assert(typeof listener === "function", "listener must be a function");
    this.emitter.on("chat-event", listener);
    return () => {
      this.emitter.off("chat-event", listener);
    };
  }

  onMetadataEvent(listener: (event: AgentSessionMetadataEvent) => void): () => void {
    assert(typeof listener === "function", "listener must be a function");
    this.emitter.on("metadata-event", listener);
    return () => {
      this.emitter.off("metadata-event", listener);
    };
  }

  async subscribeChat(listener: (event: AgentSessionChatEvent) => void): Promise<() => void> {
    this.assertNotDisposed("subscribeChat");
    assert(typeof listener === "function", "listener must be a function");

    const unsubscribe = this.onChatEvent(listener);
    await this.emitHistoricalEvents(listener);

    return unsubscribe;
  }

  async replayHistory(listener: (event: AgentSessionChatEvent) => void): Promise<void> {
    this.assertNotDisposed("replayHistory");
    assert(typeof listener === "function", "listener must be a function");
    await this.emitHistoricalEvents(listener);
  }

  emitMetadata(metadata: WorkspaceMetadata | null): void {
    this.assertNotDisposed("emitMetadata");
    this.emitter.emit("metadata-event", {
      workspaceId: this.workspaceId,
      metadata,
    } satisfies AgentSessionMetadataEvent);
  }

  private async emitHistoricalEvents(
    listener: (event: AgentSessionChatEvent) => void
  ): Promise<void> {
    const historyResult = await this.historyService.getHistory(this.workspaceId);
    if (historyResult.success) {
      for (const message of historyResult.data) {
        listener({ workspaceId: this.workspaceId, message });
      }
    }

    const streamInfo = this.aiService.getStreamInfo(this.workspaceId);
    const partial = await this.partialService.readPartial(this.workspaceId);

    if (streamInfo) {
      this.aiService.replayStream(this.workspaceId);
    } else if (partial) {
      listener({ workspaceId: this.workspaceId, message: partial });
    }

    listener({
      workspaceId: this.workspaceId,
      message: { type: "caught-up" },
    });
  }

  ensureMetadata(args: { workspacePath: string; projectName?: string }): void {
    this.assertNotDisposed("ensureMetadata");
    assert(args, "ensureMetadata requires arguments");
    const { workspacePath, projectName } = args;

    assert(typeof workspacePath === "string", "workspacePath must be a string");
    const trimmedWorkspacePath = workspacePath.trim();
    assert(trimmedWorkspacePath.length > 0, "workspacePath must not be empty");

    const normalizedWorkspacePath = path.resolve(trimmedWorkspacePath);
    const existing = this.aiService.getWorkspaceMetadata(this.workspaceId);

    if (existing.success) {
      // Metadata already exists, verify workspace path matches
      const metadata = existing.data;
      // Directory name uses workspace id (not title)
      const expectedPath = this.config.getWorkspacePath(metadata.projectPath, metadata.id);
      assert(
        expectedPath === normalizedWorkspacePath,
        `Existing metadata workspace path mismatch for ${this.workspaceId}: expected ${expectedPath}, got ${normalizedWorkspacePath}`
      );
      return;
    }

    // Derive project path from workspace path (parent directory)
    const derivedProjectPath = path.dirname(normalizedWorkspacePath);

    const derivedProjectName =
      projectName && projectName.trim().length > 0
        ? projectName.trim()
        : path.basename(derivedProjectPath) || "unknown";

    // No title initially - will be auto-generated after first message
    const metadata: WorkspaceMetadata = {
      id: this.workspaceId,
      title: undefined,
      projectName: derivedProjectName,
      projectPath: derivedProjectPath,
    };

    // Write metadata directly to config.json (single source of truth)
    this.config.addWorkspace(derivedProjectPath, metadata);
    this.emitMetadata(metadata);
  }

  async sendMessage(
    message: string,
    options?: SendMessageOptions & { imageParts?: ImagePart[] }
  ): Promise<Result<void, SendMessageError>> {
    this.assertNotDisposed("sendMessage");

    assert(typeof message === "string", "sendMessage requires a string message");
    const trimmedMessage = message.trim();
    const imageParts = options?.imageParts;

    if (trimmedMessage.length === 0 && (!imageParts || imageParts.length === 0)) {
      return Err(
        createUnknownSendMessageError(
          "Empty message not allowed. Use interruptStream() to interrupt active streams."
        )
      );
    }

    if (options?.editMessageId) {
      const truncateResult = await this.historyService.truncateAfterMessage(
        this.workspaceId,
        options.editMessageId
      );
      if (!truncateResult.success) {
        return Err(createUnknownSendMessageError(truncateResult.error));
      }
    }

    const messageId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const additionalParts =
      imageParts && imageParts.length > 0
        ? imageParts.map((img, index) => {
            assert(
              typeof img.url === "string",
              `image part [${index}] must include url string content (got ${typeof img.url}): ${JSON.stringify(img).slice(0, 200)}`
            );
            assert(
              img.url.startsWith("data:"),
              `image part [${index}] url must be a data URL (got: ${img.url.slice(0, 50)}...)`
            );
            assert(
              typeof img.mediaType === "string" && img.mediaType.trim().length > 0,
              `image part [${index}] must include a mediaType (got ${typeof img.mediaType}): ${JSON.stringify(img).slice(0, 200)}`
            );
            return {
              type: "file" as const,
              url: img.url,
              mediaType: img.mediaType,
            };
          })
        : undefined;

    const userMessage = createCmuxMessage(
      messageId,
      "user",
      message,
      {
        timestamp: Date.now(),
        toolPolicy: options?.toolPolicy,
        cmuxMetadata: options?.cmuxMetadata, // Pass through frontend metadata as black-box
      },
      additionalParts
    );

    const appendResult = await this.historyService.appendToHistory(this.workspaceId, userMessage);
    if (!appendResult.success) {
      return Err(createUnknownSendMessageError(appendResult.error));
    }

    this.emitChatEvent(userMessage);

    if (!options?.model || options.model.trim().length === 0) {
      return Err(
        createUnknownSendMessageError("No model specified. Please select a model using /model.")
      );
    }

    return this.streamWithHistory(options.model, options);
  }

  async resumeStream(options: SendMessageOptions): Promise<Result<void, SendMessageError>> {
    this.assertNotDisposed("resumeStream");

    assert(options, "resumeStream requires options");
    const { model } = options;
    assert(typeof model === "string" && model.trim().length > 0, "resumeStream requires a model");

    if (this.aiService.isStreaming(this.workspaceId)) {
      return Ok(undefined);
    }

    return this.streamWithHistory(model, options);
  }

  async interruptStream(): Promise<Result<void>> {
    this.assertNotDisposed("interruptStream");

    if (!this.aiService.isStreaming(this.workspaceId)) {
      return Ok(undefined);
    }

    const stopResult = await this.aiService.stopStream(this.workspaceId);
    if (!stopResult.success) {
      return Err(stopResult.error);
    }

    return Ok(undefined);
  }

  private async streamWithHistory(
    modelString: string,
    options?: SendMessageOptions
  ): Promise<Result<void, SendMessageError>> {
    try {
      assert(
        typeof modelString === "string" && modelString.trim().length > 0,
        "modelString must be a non-empty string"
      );
      await loadTokenizerForModel(modelString);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return Err(
        createUnknownSendMessageError(`Failed to preload tokenizer for ${modelString}: ${reason}`)
      );
    }

    const commitResult = await this.partialService.commitToHistory(this.workspaceId);
    if (!commitResult.success) {
      return Err(createUnknownSendMessageError(commitResult.error));
    }

    const historyResult = await this.historyService.getHistory(this.workspaceId);
    if (!historyResult.success) {
      return Err(createUnknownSendMessageError(historyResult.error));
    }

    // Enforce thinking policy for the specified model (single source of truth)
    // This ensures model-specific requirements are met regardless of where the request originates
    const effectiveThinkingLevel = options?.thinkingLevel
      ? enforceThinkingPolicy(modelString, options.thinkingLevel)
      : undefined;

    const streamResult = await this.aiService.streamMessage(
      historyResult.data,
      this.workspaceId,
      modelString,
      effectiveThinkingLevel,
      options?.toolPolicy,
      undefined,
      options?.additionalSystemInstructions,
      options?.maxOutputTokens,
      options?.providerOptions,
      options?.mode
    );

    return streamResult;
  }

  private attachAiListeners(): void {
    const forward = (event: string, handler: (payload: WorkspaceChatMessage) => void) => {
      const wrapped = (...args: unknown[]) => {
        const [payload] = args;
        if (
          typeof payload === "object" &&
          payload !== null &&
          "workspaceId" in payload &&
          (payload as { workspaceId: unknown }).workspaceId !== this.workspaceId
        ) {
          return;
        }
        handler(payload as WorkspaceChatMessage);
      };
      this.aiListeners.push({ event, handler: wrapped });
      this.aiService.on(event, wrapped as never);
    };

    forward("stream-start", (payload) => this.emitChatEvent(payload));
    forward("stream-delta", (payload) => this.emitChatEvent(payload));
    forward("stream-end", (payload) => {
      this.emitChatEvent(payload);
      // Auto-generate title after first assistant response (fire-and-forget)
      void this.maybeGenerateTitle();
    });
    forward("tool-call-start", (payload) => this.emitChatEvent(payload));
    forward("tool-call-delta", (payload) => this.emitChatEvent(payload));
    forward("tool-call-end", (payload) => this.emitChatEvent(payload));
    forward("reasoning-delta", (payload) => this.emitChatEvent(payload));
    forward("reasoning-end", (payload) => this.emitChatEvent(payload));
    forward("stream-abort", (payload) => this.emitChatEvent(payload));

    const errorHandler = (...args: unknown[]) => {
      const [raw] = args;
      if (
        typeof raw !== "object" ||
        raw === null ||
        !("workspaceId" in raw) ||
        (raw as { workspaceId: unknown }).workspaceId !== this.workspaceId
      ) {
        return;
      }
      const data = raw as {
        workspaceId: string;
        messageId: string;
        error: string;
        errorType?: string;
      };
      const streamError: StreamErrorMessage = {
        type: "stream-error",
        messageId: data.messageId,
        error: data.error,
        errorType: (data.errorType ?? "unknown") as StreamErrorMessage["errorType"],
      };
      this.emitChatEvent(streamError);
    };

    this.aiListeners.push({ event: "error", handler: errorHandler });
    this.aiService.on("error", errorHandler as never);
  }

  /**
   * Auto-generate workspace title after first assistant response.
   * This is a fire-and-forget operation that happens in the background.
   * Errors are logged but don't affect the stream completion.
   */
  private async maybeGenerateTitle(): Promise<void> {
    try {
      // 1. Check if workspace already has a title
      const metadataResult = this.aiService.getWorkspaceMetadata(this.workspaceId);
      if (!metadataResult.success || metadataResult.data.title) {
        return; // Already has title, skip
      }

      // 2. Check if this is the first assistant response
      const historyResult = await this.historyService.getHistory(this.workspaceId);
      if (!historyResult.success) {
        return;
      }

      const assistantMessages = historyResult.data.filter((m) => m.role === "assistant");
      if (assistantMessages.length !== 1) {
        return; // Not first message, skip
      }

      // 3. Determine which provider to use
      const providersConfig = this.config.loadProvidersConfig();
      let modelString = "anthropic:claude-haiku-4"; // Default

      if (providersConfig) {
        // Use first configured provider's cheapest model
        const providers = Object.keys(providersConfig);
        if (providers.length > 0) {
          const provider = providers[0];
          if (provider === "anthropic") {
            modelString = "anthropic:claude-haiku-4";
          } else if (provider === "openai") {
            modelString = "openai:gpt-4o-mini";
          }
        }
      }

      // 4. Create model instance using AIService (handles provider config loading)
      const [providerName, modelId] = modelString.split(":");
      let model;

      if (providerName === "anthropic") {
        const providerConfig = providersConfig?.[providerName] ?? {};
        const anthropic = createAnthropic(providerConfig);
        model = anthropic(modelId);
      } else if (providerName === "openai") {
        const providerConfig = providersConfig?.[providerName] ?? {};
        const openai = createOpenAI(providerConfig);
        model = openai(modelId);
      } else {
        // Fallback to anthropic
        const anthropic = createAnthropic({});
        model = anthropic("claude-haiku-4");
      }

      // 5. Generate title
      const result = await generateWorkspaceTitle(
        this.workspaceId,
        this.historyService,
        model,
        modelString
      );

      if (!result.success) {
        // Non-fatal: just log and continue without title
        console.error(
          `[Autotitle] Failed to generate title for ${this.workspaceId}:`,
          result.error
        );
        return;
      }

      const title = result.data;

      // 6. Update config with new title
      this.config.editConfig((config) => {
        for (const [_projectPath, projectConfig] of config.projects) {
          const workspace = projectConfig.workspaces.find((w) => w.id === this.workspaceId);
          if (workspace) {
            workspace.title = title;
            break;
          }
        }
        return config;
      });

      // 7. Emit metadata update so UI refreshes
      const updatedMetadataResult = this.aiService.getWorkspaceMetadata(this.workspaceId);
      if (updatedMetadataResult.success) {
        this.emitMetadata(updatedMetadataResult.data);
      }

      console.log(`[Autotitle] Generated title for ${this.workspaceId}: "${title}"`);
    } catch (error) {
      // Catch any unexpected errors to prevent breaking the stream
      console.error(`[Autotitle] Unexpected error for ${this.workspaceId}:`, error);
    }
  }

  private emitChatEvent(message: WorkspaceChatMessage): void {
    this.assertNotDisposed("emitChatEvent");
    this.emitter.emit("chat-event", {
      workspaceId: this.workspaceId,
      message,
    } satisfies AgentSessionChatEvent);
  }

  private assertNotDisposed(operation: string): void {
    assert(!this.disposed, `AgentSession.${operation} called after dispose`);
  }
}

import * as fs from "fs/promises";
import * as os from "os";
import { EventEmitter } from "events";
import { convertToModelMessages, type LanguageModel } from "ai";
import { applyToolOutputRedaction } from "@/utils/messages/applyToolOutputRedaction";
import type { Result } from "@/types/result";
import { Ok, Err } from "@/types/result";
import type { WorkspaceMetadata } from "@/types/workspace";

import type { CmuxMessage, CmuxTextPart } from "@/types/message";
import { createCmuxMessage } from "@/types/message";
import type { Config } from "@/config";
import { StreamManager } from "./streamManager";
import type { SendMessageError } from "@/types/errors";
import { getToolsForModel } from "@/utils/tools/tools";
import { secretsToRecord } from "@/types/secrets";
import type { CmuxProviderOptions } from "@/types/providerOptions";
import { log } from "./log";
import {
  transformModelMessages,
  validateAnthropicCompliance,
  addInterruptedSentinel,
  filterEmptyAssistantMessages,
  injectModeTransition,
} from "@/utils/messages/modelMessageTransform";
import { applyCacheControl } from "@/utils/ai/cacheStrategy";
import type { HistoryService } from "./historyService";
import type { PartialService } from "./partialService";
import { buildSystemMessage } from "./systemMessage";
import { getTokenizerForModel } from "@/utils/main/tokenizer";
import { buildProviderOptions } from "@/utils/ai/providerOptions";
import type { ThinkingLevel } from "@/types/thinking";
import type {
  StreamAbortEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  StreamStartEvent,
} from "@/types/stream";
import { applyToolPolicy, type ToolPolicy } from "@/utils/tools/toolPolicy";
import { MockScenarioPlayer } from "./mock/mockScenarioPlayer";
import { Agent } from "undici";

// Export a standalone version of getToolsForModel for use in backend

// Create undici agent with unlimited timeouts for AI streaming requests.
// Safe because users control cancellation via AbortSignal from the UI.
const unlimitedTimeoutAgent = new Agent({
  bodyTimeout: 0, // No timeout - prevents BodyTimeoutError on long reasoning pauses
  headersTimeout: 0, // No timeout for headers
});

/**
 * Default fetch function with unlimited timeouts for AI streaming.
 * Uses undici Agent to remove artificial timeout limits while still
 * respecting user cancellation via AbortSignal.
 *
 * Note: If users provide custom fetch in providers.jsonc, they are
 * responsible for configuring timeouts appropriately. Custom fetch
 * implementations using undici should set bodyTimeout: 0 and
 * headersTimeout: 0 to prevent BodyTimeoutError on long-running
 * reasoning models.
 */
const defaultFetchWithUnlimitedTimeout = (async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const requestInit: RequestInit = {
    ...(init ?? {}),
    dispatcher: unlimitedTimeoutAgent,
  };
  return fetch(input, requestInit);
}) as typeof fetch;

type FetchWithBunExtensions = typeof fetch & {
  preconnect?: typeof fetch extends { preconnect: infer P } ? P : unknown;
  certificate?: typeof fetch extends { certificate: infer C } ? C : unknown;
};

const globalFetchWithExtras = fetch as FetchWithBunExtensions;
const defaultFetchWithExtras = defaultFetchWithUnlimitedTimeout as FetchWithBunExtensions;

if (typeof globalFetchWithExtras.preconnect === "function") {
  defaultFetchWithExtras.preconnect = globalFetchWithExtras.preconnect.bind(globalFetchWithExtras);
}

if (typeof globalFetchWithExtras.certificate === "function") {
  defaultFetchWithExtras.certificate =
    globalFetchWithExtras.certificate.bind(globalFetchWithExtras);
}

/**
 * Preload AI SDK provider modules to avoid race conditions in concurrent test environments.
 * This function loads @ai-sdk/anthropic and @ai-sdk/openai eagerly so that subsequent
 * dynamic imports in createModel() hit the module cache instead of racing.
 *
 * In production, providers are lazy-loaded on first use to optimize startup time.
 * In tests, we preload them once during setup to ensure reliable concurrent execution.
 */
export async function preloadAISDKProviders(): Promise<void> {
  await Promise.all([import("@ai-sdk/anthropic"), import("@ai-sdk/openai")]);
}

export class AIService extends EventEmitter {
  private readonly streamManager: StreamManager;
  private readonly historyService: HistoryService;
  private readonly partialService: PartialService;
  private readonly config: Config;
  private readonly mockModeEnabled: boolean;
  private readonly mockScenarioPlayer?: MockScenarioPlayer;

  constructor(config: Config, historyService: HistoryService, partialService: PartialService) {
    super();
    // Increase max listeners to accommodate multiple concurrent workspace listeners
    // Each workspace subscribes to stream events, and we expect >10 concurrent workspaces
    this.setMaxListeners(50);
    this.config = config;
    this.historyService = historyService;
    this.partialService = partialService;
    this.streamManager = new StreamManager(historyService, partialService);
    void this.ensureSessionsDir();
    this.setupStreamEventForwarding();
    this.mockModeEnabled = process.env.CMUX_MOCK_AI === "1";
    if (this.mockModeEnabled) {
      log.info("AIService running in CMUX_MOCK_AI mode");
      this.mockScenarioPlayer = new MockScenarioPlayer({
        aiService: this,
        historyService,
      });
    }
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

  isMockModeEnabled(): boolean {
    return this.mockModeEnabled;
  }

  getWorkspaceMetadata(workspaceId: string): Result<WorkspaceMetadata> {
    try {
      // Read from config.json (single source of truth)
      // getAllWorkspaceMetadata() handles migration from legacy metadata.json files
      const allMetadata = this.config.getAllWorkspaceMetadata();
      const metadata = allMetadata.find((m) => m.id === workspaceId);

      if (!metadata) {
        return Err(
          `Workspace metadata not found for ${workspaceId}. Workspace may not be properly initialized.`
        );
      }

      return Ok(metadata);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to read workspace metadata: ${message}`);
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
  private async createModel(
    modelString: string,
    cmuxProviderOptions?: CmuxProviderOptions
  ): Promise<Result<LanguageModel, SendMessageError>> {
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

        // Add 1M context beta header if requested
        const use1MContext = cmuxProviderOptions?.anthropic?.use1MContext;
        const existingHeaders = providerConfig.headers as Record<string, string> | undefined;
        const headers =
          use1MContext && existingHeaders
            ? { ...existingHeaders, "anthropic-beta": "context-1m-2025-08-07" }
            : use1MContext
              ? { "anthropic-beta": "context-1m-2025-08-07" }
              : existingHeaders;

        // Lazy-load Anthropic provider to reduce startup time
        const { createAnthropic } = await import("@ai-sdk/anthropic");
        const provider = createAnthropic({ ...providerConfig, headers });
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
        // Use custom fetch if provided, otherwise default with unlimited timeout
        const baseFetch =
          typeof providerConfig.fetch === "function"
            ? (providerConfig.fetch as typeof fetch)
            : defaultFetchWithUnlimitedTimeout;

        // Wrap fetch to force truncation: "auto" for OpenAI Responses API calls.
        // This is a temporary override until @ai-sdk/openai supports passing
        // truncation via providerOptions. Safe because it only targets the
        // OpenAI Responses endpoint and leaves other providers untouched.
        // Can be disabled via cmuxProviderOptions for testing purposes.
        const disableAutoTruncation = cmuxProviderOptions?.openai?.disableAutoTruncation ?? false;
        const fetchWithOpenAITruncation = Object.assign(
          async (
            input: Parameters<typeof fetch>[0],
            init?: Parameters<typeof fetch>[1]
          ): Promise<Response> => {
            try {
              const urlString = (() => {
                if (typeof input === "string") {
                  return input;
                }
                if (input instanceof URL) {
                  return input.toString();
                }
                if (typeof input === "object" && input !== null && "url" in input) {
                  const possibleUrl = (input as { url?: unknown }).url;
                  if (typeof possibleUrl === "string") {
                    return possibleUrl;
                  }
                }
                return "";
              })();

              const method = (init?.method ?? "GET").toUpperCase();
              const isOpenAIResponses = /\/v1\/responses(\?|$)/.test(urlString);

              const body = init?.body;
              if (
                !disableAutoTruncation &&
                isOpenAIResponses &&
                method === "POST" &&
                typeof body === "string"
              ) {
                // Clone headers to avoid mutating caller-provided objects
                const headers = new Headers(init?.headers);
                // Remove content-length if present, since body will change
                headers.delete("content-length");

                try {
                  const json = JSON.parse(body) as Record<string, unknown>;
                  // Only set if not already present
                  if (json.truncation === undefined) {
                    json.truncation = "auto";
                  }
                  const newBody = JSON.stringify(json);
                  const newInit: RequestInit = { ...init, headers, body: newBody };
                  return baseFetch(input, newInit);
                } catch {
                  // If body isn't JSON, fall through to normal fetch
                  return baseFetch(input, init);
                }
              }

              // Default passthrough
              return baseFetch(input, init);
            } catch {
              // On any unexpected error, fall back to original fetch
              return baseFetch(input, init);
            }
          },
          "preconnect" in baseFetch && typeof baseFetch.preconnect === "function"
            ? {
                preconnect: baseFetch.preconnect.bind(baseFetch),
              }
            : {}
        );

        // Lazy-load OpenAI provider to reduce startup time
        const { createOpenAI } = await import("@ai-sdk/openai");
        const provider = createOpenAI({
          ...providerConfig,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
          fetch: fetchWithOpenAITruncation as any,
        });
        // Use Responses API for persistence and built-in tools
        // OpenAI manages reasoning state via previousResponseId - no middleware needed
        const model = provider.responses(modelId);
        return Ok(model);
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
   * @param toolPolicy Optional policy to filter available tools
   * @param abortSignal Optional signal to abort the stream
   * @param additionalSystemInstructions Optional additional system instructions to append
   * @param maxOutputTokens Optional maximum tokens for model output
   * @param cmuxProviderOptions Optional provider-specific options
   * @param mode Optional mode name - affects system message via Mode: sections in AGENTS.md
   * @returns Promise that resolves when streaming completes or fails
   */
  async streamMessage(
    messages: CmuxMessage[],
    workspaceId: string,
    modelString: string,
    thinkingLevel?: ThinkingLevel,
    toolPolicy?: ToolPolicy,
    abortSignal?: AbortSignal,
    additionalSystemInstructions?: string,
    maxOutputTokens?: number,
    cmuxProviderOptions?: CmuxProviderOptions,
    mode?: string
  ): Promise<Result<void, SendMessageError>> {
    try {
      if (this.mockModeEnabled && this.mockScenarioPlayer) {
        return await this.mockScenarioPlayer.play(messages, workspaceId);
      }

      // DEBUG: Log streamMessage call
      const lastMessage = messages[messages.length - 1];
      log.debug(
        `[STREAM MESSAGE] workspaceId=${workspaceId} messageCount=${messages.length} lastRole=${lastMessage?.role}`
      );

      // Before starting a new stream, commit any existing partial to history
      // This is idempotent - won't double-commit if already in chat.jsonl
      await this.partialService.commitToHistory(workspaceId);

      // Create model instance with early API key validation
      const modelResult = await this.createModel(modelString, cmuxProviderOptions);
      if (!modelResult.success) {
        return Err(modelResult.error);
      }

      // Dump original messages for debugging
      log.debug_obj(`${workspaceId}/1_original_messages.json`, messages);

      // Extract provider name from modelString (e.g., "anthropic:claude-opus-4-1" -> "anthropic")
      const [providerName] = modelString.split(":");

      // Get tool names early for mode transition sentinel (stub config, no workspace context needed)
      const earlyAllTools = await getToolsForModel(modelString, {
        cwd: process.cwd(),
        tempDir: os.tmpdir(),
        secrets: {},
      });
      const earlyTools = applyToolPolicy(earlyAllTools, toolPolicy);
      const toolNamesForSentinel = Object.keys(earlyTools);

      // Filter out assistant messages with only reasoning (no text/tools)
      const filteredMessages = filterEmptyAssistantMessages(messages);
      log.debug(`Filtered ${messages.length - filteredMessages.length} empty assistant messages`);
      log.debug_obj(`${workspaceId}/1a_filtered_messages.json`, filteredMessages);

      // OpenAI-specific: Keep reasoning parts in history
      // OpenAI manages conversation state via previousResponseId
      if (providerName === "openai") {
        log.debug("Keeping reasoning parts for OpenAI (managed via previousResponseId)");
      }

      // Add [CONTINUE] sentinel to partial messages (for model context)
      const messagesWithSentinel = addInterruptedSentinel(filteredMessages);

      // Inject mode transition context if mode changed from last assistant message
      // Include tool names so model knows what tools are available in the new mode
      const messagesWithModeContext = injectModeTransition(
        messagesWithSentinel,
        mode,
        toolNamesForSentinel
      );

      // Apply centralized tool-output redaction BEFORE converting to provider ModelMessages
      // This keeps the persisted/UI history intact while trimming heavy fields for the request
      const redactedForProvider = applyToolOutputRedaction(messagesWithModeContext);
      log.debug_obj(`${workspaceId}/2a_redacted_messages.json`, redactedForProvider);

      // Convert CmuxMessage to ModelMessage format using Vercel AI SDK utility
      // Type assertion needed because CmuxMessage has custom tool parts for interrupted tools
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const modelMessages = convertToModelMessages(redactedForProvider as any);
      log.debug_obj(`${workspaceId}/2_model_messages.json`, modelMessages);

      // Apply ModelMessage transforms based on provider requirements
      const transformedMessages = transformModelMessages(modelMessages, providerName);

      // Apply cache control for Anthropic models AFTER transformation
      const finalMessages = applyCacheControl(transformedMessages, modelString);
      log.debug_obj(`${workspaceId}/3_final_messages.json`, finalMessages);

      // Validate the messages meet Anthropic requirements (Anthropic only)
      if (providerName === "anthropic") {
        const validation = validateAnthropicCompliance(finalMessages);
        if (!validation.valid) {
          log.error(
            `Anthropic compliance validation failed: ${validation.error ?? "unknown error"}`
          );
          // Continue anyway, as the API might be more lenient
        }
      }

      // Get workspace metadata to retrieve workspace path
      const metadataResult = this.getWorkspaceMetadata(workspaceId);
      if (!metadataResult.success) {
        return Err({ type: "unknown", raw: metadataResult.error });
      }

      const metadata = metadataResult.data;

      // Get actual workspace path from config (handles both legacy and new format)
      const workspace = this.config.findWorkspace(workspaceId);
      if (!workspace) {
        return Err({ type: "unknown", raw: `Workspace ${workspaceId} not found in config` });
      }

      // Get workspace path (directory name uses workspace name)
      const workspacePath = this.config.getWorkspacePath(metadata.projectPath, metadata.name);

      // Build system message from workspace metadata
      const systemMessage = await buildSystemMessage(metadata, workspacePath, {
        mode,
        additionalSystemInstructions,
      });

      // Count system message tokens for cost tracking
      const tokenizer = getTokenizerForModel(modelString);
      const systemMessageTokens = tokenizer.countTokens(systemMessage);

      // Load project secrets
      const projectSecrets = this.config.getProjectSecrets(metadata.projectPath);

      // Generate stream token and create temp directory for tools
      const streamToken = this.streamManager.generateStreamToken();
      const tempDir = this.streamManager.createTempDirForStream(streamToken);

      // Get model-specific tools with workspace path configuration and secrets
      const allTools = await getToolsForModel(modelString, {
        cwd: workspacePath,
        secrets: secretsToRecord(projectSecrets),
        tempDir,
      });

      // Apply tool policy to filter tools (if policy provided)
      const tools = applyToolPolicy(allTools, toolPolicy);
      log.info("AIService.streamMessage: tool configuration", {
        workspaceId,
        model: modelString,
        toolNames: Object.keys(tools),
        hasToolPolicy: Boolean(toolPolicy),
      });

      // Create assistant message placeholder with historySequence from backend
      const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const assistantMessage = createCmuxMessage(assistantMessageId, "assistant", "", {
        timestamp: Date.now(),
        model: modelString,
        systemMessageTokens,
        mode, // Track the mode for this assistant response
      });

      // Append to history to get historySequence assigned
      const appendResult = await this.historyService.appendToHistory(workspaceId, assistantMessage);
      if (!appendResult.success) {
        return Err({ type: "unknown", raw: appendResult.error });
      }

      // Get the assigned historySequence
      const historySequence = assistantMessage.metadata?.historySequence ?? 0;

      const forceContextLimitError =
        modelString.startsWith("openai:") &&
        cmuxProviderOptions?.openai?.forceContextLimitError === true;
      const simulateToolPolicyNoop =
        modelString.startsWith("openai:") &&
        cmuxProviderOptions?.openai?.simulateToolPolicyNoop === true;

      if (forceContextLimitError) {
        const errorMessage =
          "Context length exceeded: the conversation is too long to send to this OpenAI model. Please shorten the history and try again.";

        const errorPartialMessage: CmuxMessage = {
          id: assistantMessageId,
          role: "assistant",
          metadata: {
            historySequence,
            timestamp: Date.now(),
            model: modelString,
            systemMessageTokens,
            partial: true,
            error: errorMessage,
            errorType: "context_exceeded",
          },
          parts: [],
        };

        await this.partialService.writePartial(workspaceId, errorPartialMessage);

        const streamStartEvent: StreamStartEvent = {
          type: "stream-start",
          workspaceId,
          messageId: assistantMessageId,
          model: modelString,
          historySequence,
        };
        this.emit("stream-start", streamStartEvent);

        this.emit("error", {
          type: "error",
          workspaceId,
          messageId: assistantMessageId,
          error: errorMessage,
          errorType: "context_exceeded",
        });

        return Ok(undefined);
      }

      if (simulateToolPolicyNoop) {
        const noopMessage = createCmuxMessage(assistantMessageId, "assistant", "", {
          timestamp: Date.now(),
          model: modelString,
          systemMessageTokens,
          toolPolicy,
        });

        const parts: StreamEndEvent["parts"] = [
          {
            type: "text",
            text: "Tool execution skipped because the requested tool is disabled by policy.",
          },
        ];

        const streamStartEvent: StreamStartEvent = {
          type: "stream-start",
          workspaceId,
          messageId: assistantMessageId,
          model: modelString,
          historySequence,
        };
        this.emit("stream-start", streamStartEvent);

        const textParts = parts.filter((part): part is CmuxTextPart => part.type === "text");
        if (textParts.length === 0) {
          throw new Error("simulateToolPolicyNoop requires at least one text part");
        }

        for (const textPart of textParts) {
          if (textPart.text.length === 0) {
            continue;
          }

          const streamDeltaEvent: StreamDeltaEvent = {
            type: "stream-delta",
            workspaceId,
            messageId: assistantMessageId,
            delta: textPart.text,
            tokens: 0, // Mock scenario - actual tokenization happens in streamManager
            timestamp: Date.now(),
          };
          this.emit("stream-delta", streamDeltaEvent);
        }

        const streamEndEvent: StreamEndEvent = {
          type: "stream-end",
          workspaceId,
          messageId: assistantMessageId,
          metadata: {
            model: modelString,
            systemMessageTokens,
          },
          parts,
        };
        this.emit("stream-end", streamEndEvent);

        const finalAssistantMessage: CmuxMessage = {
          ...noopMessage,
          metadata: {
            ...noopMessage.metadata,
            historySequence,
          },
          parts,
        };

        await this.partialService.deletePartial(workspaceId);
        await this.historyService.updateHistory(workspaceId, finalAssistantMessage);
        return Ok(undefined);
      }

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
          mode, // Pass mode so it persists in final history entry
        },
        providerOptions,
        maxOutputTokens,
        toolPolicy,
        streamToken // Pass the pre-generated stream token
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
    if (this.mockModeEnabled && this.mockScenarioPlayer) {
      this.mockScenarioPlayer.stop(workspaceId);
      return Ok(undefined);
    }
    return this.streamManager.stopStream(workspaceId);
  }

  /**
   * Check if a workspace is currently streaming
   */
  isStreaming(workspaceId: string): boolean {
    if (this.mockModeEnabled && this.mockScenarioPlayer) {
      return this.mockScenarioPlayer.isStreaming(workspaceId);
    }
    return this.streamManager.isStreaming(workspaceId);
  }

  /**
   * Get the current stream state for a workspace
   */
  getStreamState(workspaceId: string): string {
    if (this.mockModeEnabled && this.mockScenarioPlayer) {
      return this.mockScenarioPlayer.isStreaming(workspaceId) ? "streaming" : "idle";
    }
    return this.streamManager.getStreamState(workspaceId);
  }

  /**
   * Get the current stream info for a workspace if actively streaming
   * Used to re-establish streaming context on frontend reconnection
   */
  getStreamInfo(workspaceId: string): ReturnType<typeof this.streamManager.getStreamInfo> {
    if (this.mockModeEnabled && this.mockScenarioPlayer) {
      return undefined;
    }
    return this.streamManager.getStreamInfo(workspaceId);
  }

  /**
   * Replay stream events
   * Emits the same events that would be emitted during live streaming
   */
  replayStream(workspaceId: string): void {
    if (this.mockModeEnabled && this.mockScenarioPlayer) {
      this.mockScenarioPlayer.replayStream(workspaceId);
      return;
    }
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

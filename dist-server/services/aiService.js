"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const events_1 = require("events");
const ai_1 = require("ai");
const anthropic_1 = require("@ai-sdk/anthropic");
const result_1 = require("../types/result");
const workspace_1 = require("../types/workspace");
const message_1 = require("../types/message");
const streamManager_1 = require("./streamManager");
const tools_1 = require("../utils/tools/tools");
const log_1 = require("./log");
const modelMessageTransform_1 = require("../utils/messages/modelMessageTransform");
const cacheStrategy_1 = require("../utils/ai/cacheStrategy");
const systemMessage_1 = require("./systemMessage");
const tokenizer_1 = require("../utils/tokens/tokenizer");
const providerOptions_1 = require("../utils/ai/providerOptions");
const openai_1 = require("@ai-sdk/openai");
const undici_1 = require("undici");
const toolPolicy_1 = require("../utils/tools/toolPolicy");
const openaiReasoningMiddleware_1 = require("../utils/ai/openaiReasoningMiddleware");
// Export a standalone version of getToolsForModel for use in backend
// Create undici agent with unlimited timeouts for AI streaming requests.
// Safe because users control cancellation via AbortSignal from the UI.
const unlimitedTimeoutAgent = new undici_1.Agent({
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
function defaultFetchWithUnlimitedTimeout(input, init) {
    return fetch(input, { ...init, dispatcher: unlimitedTimeoutAgent });
}
class AIService extends events_1.EventEmitter {
    METADATA_FILE = "metadata.json";
    streamManager;
    historyService;
    partialService;
    config;
    constructor(config, historyService, partialService) {
        super();
        this.config = config;
        this.historyService = historyService;
        this.partialService = partialService;
        this.streamManager = new streamManager_1.StreamManager(historyService, partialService);
        void this.ensureSessionsDir();
        this.setupStreamEventForwarding();
    }
    /**
     * Forward all stream events from StreamManager to AIService consumers
     */
    setupStreamEventForwarding() {
        this.streamManager.on("stream-start", (data) => this.emit("stream-start", data));
        this.streamManager.on("stream-delta", (data) => this.emit("stream-delta", data));
        this.streamManager.on("stream-end", (data) => this.emit("stream-end", data));
        // Handle stream-abort: commit partial to history before forwarding
        this.streamManager.on("stream-abort", (data) => {
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
    async ensureSessionsDir() {
        try {
            await fs.mkdir(this.config.sessionsDir, { recursive: true });
        }
        catch (error) {
            log_1.log.error("Failed to create sessions directory:", error);
        }
    }
    getMetadataPath(workspaceId) {
        return path.join(this.config.getSessionDir(workspaceId), this.METADATA_FILE);
    }
    async getWorkspaceMetadata(workspaceId) {
        try {
            const metadataPath = this.getMetadataPath(workspaceId);
            const data = await fs.readFile(metadataPath, "utf-8");
            // Parse and validate with Zod schema (handles any type safely)
            const validated = workspace_1.WorkspaceMetadataSchema.parse(JSON.parse(data));
            return (0, result_1.Ok)(validated);
        }
        catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
                // If metadata doesn't exist, we cannot create valid defaults without the workspace path
                // The workspace path must be provided when the workspace is created
                return (0, result_1.Err)(`Workspace metadata not found for ${workspaceId}. Workspace may not be properly initialized.`);
            }
            const message = error instanceof Error ? error.message : String(error);
            return (0, result_1.Err)(`Failed to read workspace metadata: ${message}`);
        }
    }
    async saveWorkspaceMetadata(workspaceId, metadata) {
        try {
            const workspaceDir = this.config.getSessionDir(workspaceId);
            await fs.mkdir(workspaceDir, { recursive: true });
            const metadataPath = this.getMetadataPath(workspaceId);
            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
            return (0, result_1.Ok)(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return (0, result_1.Err)(`Failed to save workspace metadata: ${message}`);
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
    createModel(modelString) {
        try {
            // Parse model string (format: "provider:model-id")
            const [providerName, modelId] = modelString.split(":");
            if (!providerName || !modelId) {
                return (0, result_1.Err)({
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
                    return (0, result_1.Err)({
                        type: "api_key_not_found",
                        provider: providerName,
                    });
                }
                // Pass configuration verbatim to the provider, ensuring parity with Vercel AI SDK
                const provider = (0, anthropic_1.createAnthropic)(providerConfig);
                return (0, result_1.Ok)(provider(modelId));
            }
            // Handle OpenAI provider (using Responses API)
            if (providerName === "openai") {
                if (!providerConfig.apiKey) {
                    return (0, result_1.Err)({
                        type: "api_key_not_found",
                        provider: providerName,
                    });
                }
                // Use user's custom fetch as-is if provided (user controls timeouts),
                // otherwise use our default fetch with unlimited timeout.
                const fetchToUse = typeof providerConfig.fetch === "function"
                    ? providerConfig.fetch
                    : defaultFetchWithUnlimitedTimeout;
                const provider = (0, openai_1.createOpenAI)({
                    ...providerConfig,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                    fetch: fetchToUse,
                });
                // Use Responses API for persistence and built-in tools
                const baseModel = provider.responses(modelId);
                // Wrap with middleware to fix reasoning items
                const wrappedModel = (0, ai_1.wrapLanguageModel)({
                    model: baseModel,
                    middleware: openaiReasoningMiddleware_1.openaiReasoningFixMiddleware,
                });
                return (0, result_1.Ok)(wrappedModel);
            }
            return (0, result_1.Err)({
                type: "provider_not_supported",
                provider: providerName,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return (0, result_1.Err)({ type: "unknown", raw: `Failed to create model: ${errorMessage}` });
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
     * @returns Promise that resolves when streaming completes or fails
     */
    async streamMessage(messages, workspaceId, modelString, thinkingLevel, toolPolicy, abortSignal, additionalSystemInstructions, maxOutputTokens) {
        try {
            // DEBUG: Log streamMessage call
            const lastMessage = messages[messages.length - 1];
            log_1.log.debug(`[STREAM MESSAGE] workspaceId=${workspaceId} messageCount=${messages.length} lastRole=${lastMessage?.role}`);
            // Before starting a new stream, commit any existing partial to history
            // This is idempotent - won't double-commit if already in chat.jsonl
            await this.partialService.commitToHistory(workspaceId);
            // Create model instance with early API key validation
            const modelResult = this.createModel(modelString);
            if (!modelResult.success) {
                return (0, result_1.Err)(modelResult.error);
            }
            // Dump original messages for debugging
            log_1.log.debug_obj(`${workspaceId}/1_original_messages.json`, messages);
            // Extract provider name from modelString (e.g., "anthropic:claude-opus-4-1" -> "anthropic")
            const [providerName] = modelString.split(":");
            // Filter out assistant messages with only reasoning (no text/tools)
            let filteredMessages = (0, modelMessageTransform_1.filterEmptyAssistantMessages)(messages);
            log_1.log.debug(`Filtered ${messages.length - filteredMessages.length} empty assistant messages`);
            log_1.log.debug_obj(`${workspaceId}/1a_filtered_messages.json`, filteredMessages);
            // OpenAI-specific: Strip reasoning parts from history
            // OpenAI manages reasoning via previousResponseId; sending Anthropic-style reasoning
            // parts creates orphaned reasoning items that cause API errors
            if (providerName === "openai") {
                filteredMessages = (0, modelMessageTransform_1.stripReasoningForOpenAI)(filteredMessages);
                log_1.log.debug("Stripped reasoning parts for OpenAI");
                log_1.log.debug_obj(`${workspaceId}/1b_openai_stripped.json`, filteredMessages);
            }
            // Add [INTERRUPTED] sentinel to partial messages (for model context)
            const messagesWithSentinel = (0, modelMessageTransform_1.addInterruptedSentinel)(filteredMessages);
            // Convert CmuxMessage to ModelMessage format using Vercel AI SDK utility
            // Type assertion needed because CmuxMessage has custom tool parts for interrupted tools
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
            const modelMessages = (0, ai_1.convertToModelMessages)(messagesWithSentinel);
            log_1.log.debug_obj(`${workspaceId}/2_model_messages.json`, modelMessages);
            // Apply ModelMessage transforms based on provider requirements
            const transformedMessages = (0, modelMessageTransform_1.transformModelMessages)(modelMessages, providerName);
            // Apply cache control for Anthropic models AFTER transformation
            const finalMessages = (0, cacheStrategy_1.applyCacheControl)(transformedMessages, modelString);
            log_1.log.debug_obj(`${workspaceId}/3_final_messages.json`, finalMessages);
            // Validate the messages meet Anthropic requirements (Anthropic only)
            if (providerName === "anthropic") {
                const validation = (0, modelMessageTransform_1.validateAnthropicCompliance)(finalMessages);
                if (!validation.valid) {
                    log_1.log.error(`Anthropic compliance validation failed: ${validation.error}`);
                    // Continue anyway, as the API might be more lenient
                }
            }
            // Get workspace metadata to retrieve workspace path
            const metadataResult = await this.getWorkspaceMetadata(workspaceId);
            if (!metadataResult.success) {
                return (0, result_1.Err)({ type: "unknown", raw: metadataResult.error });
            }
            // Build system message from workspace metadata
            const systemMessage = await (0, systemMessage_1.buildSystemMessage)(metadataResult.data, additionalSystemInstructions);
            // Count system message tokens for cost tracking
            const tokenizer = (0, tokenizer_1.getTokenizerForModel)(modelString);
            const systemMessageTokens = tokenizer.countTokens(systemMessage);
            const workspacePath = metadataResult.data.workspacePath;
            // Get model-specific tools with workspace path configuration
            const allTools = (0, tools_1.getToolsForModel)(modelString, { cwd: workspacePath });
            // Apply tool policy to filter tools (if policy provided)
            const tools = (0, toolPolicy_1.applyToolPolicy)(allTools, toolPolicy);
            // Create assistant message placeholder with historySequence from backend
            const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            const assistantMessage = (0, message_1.createCmuxMessage)(assistantMessageId, "assistant", "", {
                timestamp: Date.now(),
                model: modelString,
                systemMessageTokens,
            });
            // Append to history to get historySequence assigned
            const appendResult = await this.historyService.appendToHistory(workspaceId, assistantMessage);
            if (!appendResult.success) {
                return (0, result_1.Err)({ type: "unknown", raw: appendResult.error });
            }
            // Get the assigned historySequence
            const historySequence = assistantMessage.metadata?.historySequence ?? 0;
            // Build provider options based on thinking level and message history
            // Pass filtered messages so OpenAI can extract previousResponseId for persistence
            const providerOptions = (0, providerOptions_1.buildProviderOptions)(modelString, thinkingLevel ?? "off", filteredMessages);
            // Delegate to StreamManager with model instance, system message, tools, historySequence, and initial metadata
            const streamResult = await this.streamManager.startStream(workspaceId, finalMessages, modelResult.data, modelString, historySequence, systemMessage, abortSignal, tools, {
                systemMessageTokens,
                timestamp: Date.now(),
            }, providerOptions, maxOutputTokens, toolPolicy);
            if (!streamResult.success) {
                // StreamManager already returns SendMessageError
                return (0, result_1.Err)(streamResult.error);
            }
            // StreamManager now handles history updates directly on stream-end
            // No need for event listener here
            return (0, result_1.Ok)(undefined);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log_1.log.error("Stream message error:", error);
            // Return as unknown error type
            return (0, result_1.Err)({ type: "unknown", raw: `Failed to stream message: ${errorMessage}` });
        }
    }
    async stopStream(workspaceId) {
        return this.streamManager.stopStream(workspaceId);
    }
    /**
     * Check if a workspace is currently streaming
     */
    isStreaming(workspaceId) {
        return this.streamManager.isStreaming(workspaceId);
    }
    /**
     * Get the current stream state for a workspace
     */
    getStreamState(workspaceId) {
        return this.streamManager.getStreamState(workspaceId);
    }
    /**
     * Get the current stream info for a workspace if actively streaming
     * Used to re-establish streaming context on frontend reconnection
     */
    getStreamInfo(workspaceId) {
        return this.streamManager.getStreamInfo(workspaceId);
    }
    /**
     * Replay stream events
     * Emits the same events that would be emitted during live streaming
     */
    replayStream(workspaceId) {
        this.streamManager.replayStream(workspaceId);
    }
    async deleteWorkspace(workspaceId) {
        try {
            const workspaceDir = this.config.getSessionDir(workspaceId);
            await fs.rm(workspaceDir, { recursive: true, force: true });
            return (0, result_1.Ok)(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return (0, result_1.Err)(`Failed to delete workspace: ${message}`);
        }
    }
}
exports.AIService = AIService;
//# sourceMappingURL=aiService.js.map
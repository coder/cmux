"use strict";
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamManager = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
const ai_1 = require("ai");
const result_1 = require("../types/result");
const log_1 = require("./log");
const asyncMutex_1 = require("../utils/concurrency/asyncMutex");
// Stream state enum for exhaustive checking
var StreamState;
(function (StreamState) {
    StreamState["IDLE"] = "idle";
    StreamState["STARTING"] = "starting";
    StreamState["STREAMING"] = "streaming";
    StreamState["STOPPING"] = "stopping";
    StreamState["ERROR"] = "error";
})(StreamState || (StreamState = {}));
/**
 * Strip encryptedContent from web search results to reduce token usage.
 * The encrypted page content can be massive (4000+ chars per result) and isn't
 * needed for model context. Keep URL, title, and pageAge for reference.
 */
function stripEncryptedContent(output) {
    // Check if output is JSON with a value array (web search results)
    if (typeof output === "object" &&
        output !== null &&
        "type" in output &&
        output.type === "json" &&
        "value" in output &&
        Array.isArray(output.value)) {
        // Strip encryptedContent from each search result
        const strippedValue = output.value.map((item) => {
            if (item && typeof item === "object" && "encryptedContent" in item) {
                // Remove encryptedContent but keep other fields
                const { encryptedContent, ...rest } = item;
                return rest;
            }
            return item;
        });
        return {
            ...output,
            value: strippedValue,
        };
    }
    return output;
}
/**
 * StreamManager - Handles all streaming operations with type safety and atomic operations
 *
 * Key invariants:
 * - Only one active stream per workspace at any time
 * - Atomic stream creation/cancellation operations
 * - Guaranteed resource cleanup in all code paths
 */
class StreamManager extends events_1.EventEmitter {
    workspaceStreams = new Map();
    streamLocks = new Map();
    PARTIAL_WRITE_THROTTLE_MS = 500;
    historyService;
    partialService;
    constructor(historyService, partialService) {
        super();
        this.historyService = historyService;
        this.partialService = partialService;
    }
    /**
     * Write the current partial message to disk (throttled by mtime)
     * Ensures writes happen during rapid streaming (crash-resilient)
     */
    async schedulePartialWrite(workspaceId, streamInfo) {
        const now = Date.now();
        const timeSinceLastWrite = now - streamInfo.lastPartialWriteTime;
        // If enough time has passed, write immediately
        if (timeSinceLastWrite >= this.PARTIAL_WRITE_THROTTLE_MS) {
            await this.flushPartialWrite(workspaceId, streamInfo);
            return;
        }
        // Otherwise, schedule write for remaining time (fire-and-forget for scheduled writes)
        if (streamInfo.partialWriteTimer) {
            clearTimeout(streamInfo.partialWriteTimer);
        }
        const remainingTime = this.PARTIAL_WRITE_THROTTLE_MS - timeSinceLastWrite;
        streamInfo.partialWriteTimer = setTimeout(() => {
            void this.flushPartialWrite(workspaceId, streamInfo);
        }, remainingTime);
    }
    /**
     * Flush any pending partial write and write immediately
     * Serializes writes to prevent races - waits for any in-flight write before starting new one
     */
    async flushPartialWrite(workspaceId, streamInfo) {
        // Wait for any in-flight write to complete first (serialization)
        if (streamInfo.partialWritePromise) {
            await streamInfo.partialWritePromise;
        }
        // Clear throttle timer
        if (streamInfo.partialWriteTimer) {
            clearTimeout(streamInfo.partialWriteTimer);
            streamInfo.partialWriteTimer = undefined;
        }
        // Start new write and track the promise
        streamInfo.partialWritePromise = (async () => {
            try {
                const partialMessage = {
                    id: streamInfo.messageId,
                    role: "assistant",
                    metadata: {
                        historySequence: streamInfo.historySequence,
                        timestamp: streamInfo.startTime,
                        model: streamInfo.model,
                        partial: true, // Always true - this method only writes partial messages
                        ...streamInfo.initialMetadata,
                    },
                    parts: streamInfo.parts, // Parts array includes reasoning, text, and tools
                };
                await this.partialService.writePartial(workspaceId, partialMessage);
                streamInfo.lastPartialWriteTime = Date.now();
            }
            catch (error) {
                log_1.log.error("Failed to write partial message:", error);
            }
            finally {
                // Clear promise when write completes
                streamInfo.partialWritePromise = undefined;
            }
        })();
        // Wait for this write to complete
        await streamInfo.partialWritePromise;
    }
    /**
     * Atomically ensures stream safety by cancelling any existing stream
     * @param workspaceId The workspace to ensure stream safety for
     * @returns A unique stream token for the new stream
     */
    async ensureStreamSafety(workspaceId) {
        const existing = this.workspaceStreams.get(workspaceId);
        if (existing && existing.state !== StreamState.IDLE) {
            await this.cancelStreamSafely(workspaceId, existing);
        }
        // Generate unique token for this stream
        return (0, crypto_1.randomUUID)();
    }
    /**
     * Safely cancels an existing stream with proper cleanup
     *
     * CRITICAL: Waits for the processing promise to complete before cleanup.
     * This ensures the old stream fully exits before a new stream can start,
     * preventing concurrent streams and race conditions.
     */
    async cancelStreamSafely(workspaceId, streamInfo) {
        try {
            streamInfo.state = StreamState.STOPPING;
            // Flush any pending partial write immediately (preserves work on interruption)
            await this.flushPartialWrite(workspaceId, streamInfo);
            streamInfo.abortController.abort();
            // CRITICAL: Wait for processing to fully complete before cleanup
            // This prevents race conditions where the old stream is still running
            // while a new stream starts (e.g., old stream writing to partial.json)
            await streamInfo.processingPromise;
            // Emit abort event
            this.emit("stream-abort", {
                type: "stream-abort",
                workspaceId: workspaceId,
                messageId: streamInfo.messageId,
            });
            // Clean up immediately
            this.workspaceStreams.delete(workspaceId);
        }
        catch (error) {
            console.error("Error during stream cancellation:", error);
            // Force cleanup even if cancellation fails
            this.workspaceStreams.delete(workspaceId);
        }
    }
    /**
     * Atomically creates a new stream with all necessary setup
     */
    createStreamAtomically(workspaceId, streamToken, messages, model, modelString, abortSignal, system, historySequence, tools, initialMetadata, providerOptions, maxOutputTokens, toolPolicy) {
        // Create abort controller for this specific stream
        const abortController = new AbortController();
        // Link external abort signal
        if (abortSignal) {
            abortSignal.addEventListener("abort", () => abortController.abort());
        }
        // Determine toolChoice based on toolPolicy
        // If a tool is required (tools object has exactly one tool after applyToolPolicy),
        // force the model to use it with toolChoice: { type: "required", toolName: "..." }
        let toolChoice;
        if (tools && toolPolicy) {
            // Check if any filter has "require" action
            const hasRequireAction = toolPolicy.some((filter) => filter.action === "require");
            if (hasRequireAction && Object.keys(tools).length === 1) {
                const requiredToolName = Object.keys(tools)[0];
                toolChoice = { type: "required", toolName: requiredToolName };
                log_1.log.debug("Setting toolChoice to required", { toolName: requiredToolName });
            }
        }
        // Start streaming - this can throw immediately if API key is missing
        let streamResult;
        try {
            streamResult = (0, ai_1.streamText)({
                model,
                messages,
                system,
                abortSignal: abortController.signal,
                tools,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                toolChoice: toolChoice, // Force tool use when required by policy
                // When toolChoice is set (required tool), limit to 1 step to prevent infinite loops
                // Otherwise allow unlimited steps for multi-turn tool use
                ...(toolChoice ? { maxSteps: 1 } : { stopWhen: (0, ai_1.stepCountIs)(100000) }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                providerOptions: providerOptions, // Pass provider-specific options (thinking/reasoning config)
                // Default to 32000 tokens if not specified (Anthropic defaults to 4096)
                maxOutputTokens: maxOutputTokens ?? 32000,
            });
        }
        catch (error) {
            // Clean up abort controller if stream creation fails
            abortController.abort();
            // Re-throw the error to be caught by startStream
            throw error;
        }
        const messageId = `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const streamInfo = {
            state: StreamState.STARTING,
            streamResult,
            abortController,
            messageId,
            token: streamToken,
            startTime: Date.now(),
            model: modelString,
            initialMetadata,
            historySequence,
            parts: [], // Initialize empty parts array
            lastPartialWriteTime: 0, // Initialize to 0 to allow immediate first write
            partialWritePromise: undefined, // No write in flight initially
            processingPromise: Promise.resolve(), // Placeholder, overwritten in startStream
        };
        // Atomically register the stream
        this.workspaceStreams.set(workspaceId, streamInfo);
        return streamInfo;
    }
    /**
     * Processes a stream with guaranteed cleanup, regardless of success or failure
     */
    async processStreamWithCleanup(workspaceId, streamInfo, historySequence) {
        try {
            // Update state to streaming
            streamInfo.state = StreamState.STREAMING;
            // Emit stream start event
            this.emit("stream-start", {
                type: "stream-start",
                workspaceId: workspaceId,
                messageId: streamInfo.messageId,
                model: streamInfo.model,
                historySequence,
            });
            // Use fullStream to capture all events including tool calls
            const toolCalls = new Map();
            for await (const part of streamInfo.streamResult.fullStream) {
                // Check if stream was cancelled BEFORE processing any parts
                // This improves interruption responsiveness by catching aborts earlier
                if (streamInfo.abortController.signal.aborted) {
                    log_1.log.debug("streamManager: Stream aborted, breaking from loop");
                    break;
                }
                // Log all stream parts to debug reasoning (commented out - too spammy)
                // log.debug("streamManager: Stream part", {
                //   type: part.type,
                //   hasText: "text" in part,
                //   preview: "text" in part ? (part as StreamPartWithText).text?.substring(0, 50) : undefined,
                // });
                switch (part.type) {
                    case "text-delta":
                        this.emit("stream-delta", {
                            type: "stream-delta",
                            workspaceId: workspaceId,
                            messageId: streamInfo.messageId,
                            delta: part.text,
                        });
                        // Append each delta as a new part (merging happens at display time)
                        streamInfo.parts.push({
                            type: "text",
                            text: part.text,
                        });
                        // Schedule partial write (throttled, fire-and-forget to not block stream)
                        void this.schedulePartialWrite(workspaceId, streamInfo);
                        break;
                    case "reasoning-delta": {
                        // Both Anthropic and OpenAI use reasoning-delta for streaming reasoning content
                        const delta = part.text ?? "";
                        // Append each delta as a new part (merging happens at display time)
                        streamInfo.parts.push({
                            type: "reasoning",
                            text: delta,
                        });
                        this.emit("reasoning-delta", {
                            type: "reasoning-delta",
                            workspaceId: workspaceId,
                            messageId: streamInfo.messageId,
                            delta,
                        });
                        void this.schedulePartialWrite(workspaceId, streamInfo);
                        break;
                    }
                    case "reasoning-end": {
                        // Reasoning-end is just a signal - no state to update
                        this.emit("reasoning-end", {
                            type: "reasoning-end",
                            workspaceId: workspaceId,
                            messageId: streamInfo.messageId,
                        });
                        break;
                    }
                    case "tool-call": {
                        // Tool call started - store in map for later lookup
                        toolCalls.set(part.toolCallId, {
                            toolCallId: part.toolCallId,
                            toolName: part.toolName,
                            input: part.input,
                        });
                        // IMPORTANT: Add tool part to streamInfo.parts immediately (not just on completion)
                        // This ensures in-progress tool calls are saved to partial.json if stream is interrupted
                        const toolPart = {
                            type: "dynamic-tool",
                            toolCallId: part.toolCallId,
                            toolName: part.toolName,
                            state: "input-available",
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                            input: part.input,
                        };
                        streamInfo.parts.push(toolPart);
                        this.emit("tool-call-start", {
                            type: "tool-call-start",
                            workspaceId: workspaceId,
                            messageId: streamInfo.messageId,
                            toolCallId: part.toolCallId,
                            toolName: part.toolName,
                            args: part.input,
                        });
                        break;
                    }
                    case "tool-result": {
                        // Tool call completed - update the existing tool part with output
                        const toolCall = toolCalls.get(part.toolCallId);
                        if (toolCall) {
                            // Strip encrypted content from web search results before storing
                            const strippedOutput = stripEncryptedContent(part.output);
                            toolCall.output = strippedOutput;
                            // Find and update the existing tool part (added during tool-call)
                            const existingPartIndex = streamInfo.parts.findIndex((p) => p.type === "dynamic-tool" && p.toolCallId === part.toolCallId);
                            if (existingPartIndex !== -1) {
                                // Update existing part with output
                                const existingPart = streamInfo.parts[existingPartIndex];
                                if (existingPart.type === "dynamic-tool") {
                                    streamInfo.parts[existingPartIndex] = {
                                        ...existingPart,
                                        state: "output-available",
                                        output: strippedOutput,
                                    };
                                }
                            }
                            else {
                                // Fallback: part not found (shouldn't happen), add it
                                streamInfo.parts.push({
                                    type: "dynamic-tool",
                                    toolCallId: part.toolCallId,
                                    toolName: part.toolName,
                                    state: "output-available",
                                    input: toolCall.input,
                                    output: strippedOutput,
                                });
                            }
                            this.emit("tool-call-end", {
                                type: "tool-call-end",
                                workspaceId: workspaceId,
                                messageId: streamInfo.messageId,
                                toolCallId: part.toolCallId,
                                toolName: part.toolName,
                                result: strippedOutput,
                            });
                            // Schedule partial write after tool result (throttled, fire-and-forget)
                            void this.schedulePartialWrite(workspaceId, streamInfo);
                        }
                        break;
                    }
                    // Handle error parts from the stream (e.g., OpenAI context_length_exceeded)
                    case "error": {
                        // Capture the error and immediately throw to trigger error handling
                        // Error parts are structured errors from the AI SDK
                        const errorPart = part;
                        // Try to extract error message from various possible structures
                        let errorMessage;
                        if (errorPart.error instanceof Error) {
                            throw errorPart.error;
                        }
                        else if (typeof errorPart.error === "object" && errorPart.error !== null) {
                            const errorObj = errorPart.error;
                            // Check for nested error object with message (OpenAI format)
                            if (errorObj.error && typeof errorObj.error === "object" && errorObj.error !== null) {
                                const nestedError = errorObj.error;
                                if (typeof nestedError.message === "string") {
                                    errorMessage = nestedError.message;
                                }
                            }
                            // Fallback to direct message property
                            errorMessage ??= typeof errorObj.message === "string" ? errorObj.message : undefined;
                            // Last resort: stringify the error
                            errorMessage ??= JSON.stringify(errorObj);
                            const error = new Error(errorMessage);
                            // Preserve original error as cause for debugging
                            Object.assign(error, { cause: errorObj });
                            throw error;
                        }
                        else {
                            throw new Error(String(errorPart.error));
                        }
                    }
                    // Handle other event types as needed
                    case "start":
                    case "start-step":
                    case "text-start":
                    case "finish":
                    case "finish-step":
                        // These events can be logged or handled if needed
                        break;
                }
            }
            // No need to save remaining text - text-delta handler already maintains parts array
            // (Removed duplicate push that was causing double text parts)
            // Flush final state to partial.json for crash resilience
            // This happens regardless of abort status to ensure the final state is persisted to disk
            // On abort: second flush after cancelStreamSafely, ensures all streamed content is saved
            // On normal completion: provides crash resilience before AIService writes to chat.jsonl
            await this.flushPartialWrite(workspaceId, streamInfo);
            // Check if stream completed successfully
            if (!streamInfo.abortController.signal.aborted) {
                // Get usage and provider metadata from stream result
                const usage = await streamInfo.streamResult.usage;
                const providerMetadata = await streamInfo.streamResult.providerMetadata;
                // Emit stream end event with parts preserved in temporal order
                const streamEndEvent = {
                    type: "stream-end",
                    workspaceId: workspaceId,
                    messageId: streamInfo.messageId,
                    metadata: {
                        ...streamInfo.initialMetadata, // AIService-provided metadata (systemMessageTokens, etc)
                        model: streamInfo.model,
                        usage, // AI SDK normalized usage
                        providerMetadata, // Raw provider metadata
                        duration: Date.now() - streamInfo.startTime,
                    },
                    parts: streamInfo.parts, // Parts array with temporal ordering (includes reasoning)
                };
                this.emit("stream-end", streamEndEvent);
                // Update history with final message (only if there are parts)
                if (streamInfo.parts && streamInfo.parts.length > 0) {
                    const finalAssistantMessage = {
                        id: streamInfo.messageId,
                        role: "assistant",
                        metadata: {
                            ...streamEndEvent.metadata,
                            historySequence: streamInfo.historySequence,
                        },
                        parts: streamInfo.parts,
                    };
                    // CRITICAL: Delete partial.json before updating chat.jsonl
                    // On successful completion, partial.json becomes stale and must be removed
                    await this.partialService.deletePartial(workspaceId);
                    // Update the placeholder message in chat.jsonl with final content
                    await this.historyService.updateHistory(workspaceId, finalAssistantMessage);
                }
            }
        }
        catch (error) {
            streamInfo.state = StreamState.ERROR;
            // Log the actual error for debugging
            console.error("Stream processing error:", error);
            // Extract error message (errors thrown from 'error' parts already have the correct message)
            let errorMessage = error instanceof Error ? error.message : String(error);
            let actualError = error;
            // For categorization, use the cause if available (preserves the original error structure)
            if (error instanceof Error && error.cause) {
                actualError = error.cause;
            }
            let errorType = this.categorizeError(actualError);
            // Detect and enhance model-not-found errors
            if (ai_1.APICallError.isInstance(actualError)) {
                const apiError = actualError;
                // Type guard for error data structure
                const hasErrorProperty = (data) => {
                    return (typeof data === "object" &&
                        data !== null &&
                        "error" in data &&
                        typeof data.error === "object" &&
                        data.error !== null);
                };
                // OpenAI: 400 with error.code === 'model_not_found'
                const isOpenAIModelError = apiError.statusCode === 400 &&
                    hasErrorProperty(apiError.data) &&
                    apiError.data.error.code === "model_not_found";
                // Anthropic: 404 with error.type === 'not_found_error'
                const isAnthropicModelError = apiError.statusCode === 404 &&
                    hasErrorProperty(apiError.data) &&
                    apiError.data.error.type === "not_found_error";
                if (isOpenAIModelError || isAnthropicModelError) {
                    errorType = "model_not_found";
                    // Extract model name from model string (e.g., "anthropic:sonnet-1m" -> "sonnet-1m")
                    const [, modelName] = streamInfo.model.split(":");
                    errorMessage = `Model '${modelName || streamInfo.model}' does not exist or is not available. Please check your model selection.`;
                }
            }
            // If we detect API key issues in the error message, override the type
            if (errorMessage.toLowerCase().includes("api key") ||
                errorMessage.toLowerCase().includes("api_key") ||
                errorMessage.toLowerCase().includes("anthropic_api_key")) {
                errorType = "authentication";
            }
            // Write error metadata to partial.json for persistence across reloads
            const errorPartialMessage = {
                id: streamInfo.messageId,
                role: "assistant",
                metadata: {
                    historySequence: streamInfo.historySequence,
                    timestamp: streamInfo.startTime,
                    model: streamInfo.model,
                    partial: true,
                    error: errorMessage,
                    errorType,
                    ...streamInfo.initialMetadata,
                },
                parts: streamInfo.parts,
            };
            // Write error state to disk (fire-and-forget to not block error emission)
            void this.partialService.writePartial(workspaceId, errorPartialMessage);
            // Emit error event
            this.emit("error", {
                type: "error",
                workspaceId: workspaceId,
                messageId: streamInfo.messageId,
                error: errorMessage,
                errorType: errorType,
            });
        }
        finally {
            // Guaranteed cleanup in all code paths
            // Clear any pending timers to prevent keeping process alive
            if (streamInfo.partialWriteTimer) {
                clearTimeout(streamInfo.partialWriteTimer);
                streamInfo.partialWriteTimer = undefined;
            }
            this.workspaceStreams.delete(workspaceId);
        }
    }
    /**
     * Converts errors to strongly-typed SendMessageError
     */
    convertToSendMessageError(error) {
        // Check for specific AI SDK errors using type guards
        if (ai_1.LoadAPIKeyError.isInstance(error)) {
            return {
                type: "api_key_not_found",
                provider: "anthropic", // We can infer this from LoadAPIKeyError context
            };
        }
        // TODO: Add more specific error types as needed
        // if (APICallError.isInstance(error)) {
        //   if (error.statusCode === 401) return { type: "authentication", ... };
        //   if (error.statusCode === 429) return { type: "rate_limit", ... };
        // }
        // if (RetryError.isInstance(error)) {
        //   return { type: "retry_failed", ... };
        // }
        // Fallback for unknown errors
        const message = error instanceof Error ? error.message : String(error);
        return { type: "unknown", raw: message };
    }
    /**
     * Categorizes errors for better error handling (used for event emission)
     */
    categorizeError(error) {
        // Use AI SDK error type guards first
        if (ai_1.LoadAPIKeyError.isInstance(error)) {
            return "authentication";
        }
        if (ai_1.APICallError.isInstance(error)) {
            if (error.statusCode === 401)
                return "authentication";
            if (error.statusCode === 429)
                return "rate_limit";
            if (error.statusCode && error.statusCode >= 500)
                return "server_error";
            // Check for Anthropic context exceeded errors
            if (error.message.includes("prompt is too long:")) {
                return "context_exceeded";
            }
            return "api";
        }
        if (ai_1.RetryError.isInstance(error)) {
            return "retry_failed";
        }
        // Check for OpenAI/Anthropic structured error format (from error.cause)
        // Structure: { error: { code: 'context_length_exceeded', type: '...', message: '...' } }
        if (typeof error === "object" &&
            error !== null &&
            "error" in error &&
            typeof error.error === "object" &&
            error.error !== null) {
            const structuredError = error.error;
            // OpenAI context length errors have code: 'context_length_exceeded'
            if (structuredError.code === "context_length_exceeded") {
                return "context_exceeded";
            }
            // Check for other specific error codes/types
            if (structuredError.code === "rate_limit_exceeded") {
                return "rate_limit";
            }
        }
        // Fall back to string matching for other errors
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (error.name === "AbortError" || message.includes("abort")) {
                return "aborted";
            }
            else if (message.includes("network") || message.includes("fetch")) {
                return "network";
            }
            else if (message.includes("token") ||
                message.includes("context") ||
                message.includes("too long") ||
                message.includes("maximum")) {
                return "context_exceeded";
            }
            else if (message.includes("quota") || message.includes("limit")) {
                return "quota";
            }
            else if (message.includes("auth") || message.includes("key")) {
                return "authentication";
            }
            else {
                return "api";
            }
        }
        return "unknown";
    }
    /**
     * Starts a new stream for a workspace, automatically cancelling any existing stream
     *
     * Uses per-workspace mutex to prevent concurrent streams. The mutex ensures:
     * 1. Only one startStream can execute at a time per workspace
     * 2. Old stream fully exits before new stream starts
     * 3. No race conditions in stream registration or cleanup
     */
    async startStream(workspaceId, messages, model, modelString, historySequence, system, abortSignal, tools, initialMetadata, providerOptions, maxOutputTokens, toolPolicy) {
        const typedWorkspaceId = workspaceId;
        // Get or create mutex for this workspace
        if (!this.streamLocks.has(typedWorkspaceId)) {
            this.streamLocks.set(typedWorkspaceId, new asyncMutex_1.AsyncMutex());
        }
        const mutex = this.streamLocks.get(typedWorkspaceId);
        try {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                // Acquire lock - guarantees only one startStream per workspace
                // Lock is automatically released when scope exits via Symbol.asyncDispose
                const _lock = __addDisposableResource(env_1, await mutex.acquire(), true);
                // DEBUG: Log stream start
                log_1.log.debug(`[STREAM START] workspaceId=${workspaceId} historySequence=${historySequence} model=${modelString}`);
                // Step 1: Atomic safety check (cancels any existing stream and waits for full exit)
                const streamToken = await this.ensureStreamSafety(typedWorkspaceId);
                // Step 2: Atomic stream creation and registration
                const streamInfo = this.createStreamAtomically(typedWorkspaceId, streamToken, messages, model, modelString, abortSignal, system, historySequence, tools, initialMetadata, providerOptions, maxOutputTokens, toolPolicy);
                // Step 3: Track the processing promise for guaranteed cleanup
                // This allows cancelStreamSafely to wait for full exit
                streamInfo.processingPromise = this.processStreamWithCleanup(typedWorkspaceId, streamInfo, historySequence).catch((error) => {
                    console.error("Unexpected error in stream processing:", error);
                });
                return (0, result_1.Ok)(streamToken);
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                const result_2 = __disposeResources(env_1);
                if (result_2)
                    await result_2;
            }
        }
        catch (error) {
            // Guaranteed cleanup on any failure
            this.workspaceStreams.delete(typedWorkspaceId);
            // Convert to strongly-typed error
            return (0, result_1.Err)(this.convertToSendMessageError(error));
        }
    }
    /**
     * Stops an active stream for a workspace
     */
    async stopStream(workspaceId) {
        const typedWorkspaceId = workspaceId;
        try {
            const streamInfo = this.workspaceStreams.get(typedWorkspaceId);
            if (streamInfo) {
                await this.cancelStreamSafely(typedWorkspaceId, streamInfo);
            }
            return (0, result_1.Ok)(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return (0, result_1.Err)(`Failed to stop stream: ${message}`);
        }
    }
    /**
     * Gets the current stream state for a workspace
     */
    getStreamState(workspaceId) {
        const typedWorkspaceId = workspaceId;
        const streamInfo = this.workspaceStreams.get(typedWorkspaceId);
        return streamInfo?.state ?? StreamState.IDLE;
    }
    /**
     * Checks if a workspace currently has an active stream
     */
    isStreaming(workspaceId) {
        const state = this.getStreamState(workspaceId);
        return state === StreamState.STARTING || state === StreamState.STREAMING;
    }
    /**
     * Gets all active workspace streams (for debugging/monitoring)
     */
    getActiveStreams() {
        return Array.from(this.workspaceStreams.keys()).map((id) => id);
    }
    /**
     * Gets the current stream info for a workspace if actively streaming
     * Returns undefined if no active stream exists
     * Used to re-establish streaming context on frontend reconnection
     */
    getStreamInfo(workspaceId) {
        const typedWorkspaceId = workspaceId;
        const streamInfo = this.workspaceStreams.get(typedWorkspaceId);
        // Only return info if stream is actively running
        if (streamInfo &&
            (streamInfo.state === StreamState.STARTING || streamInfo.state === StreamState.STREAMING)) {
            return {
                messageId: streamInfo.messageId,
                model: streamInfo.model,
                historySequence: streamInfo.historySequence,
                parts: streamInfo.parts,
            };
        }
        return undefined;
    }
    /**
     * Replay stream events
     * Emits the same events (stream-start, stream-delta, etc.) that would be emitted during live streaming
     * This allows replay to flow through the same event path as live streaming (no duplication)
     */
    replayStream(workspaceId) {
        const typedWorkspaceId = workspaceId;
        const streamInfo = this.workspaceStreams.get(typedWorkspaceId);
        // Only replay if stream is actively running
        if (!streamInfo ||
            (streamInfo.state !== StreamState.STARTING && streamInfo.state !== StreamState.STREAMING)) {
            return;
        }
        // Emit stream-start event
        this.emit("stream-start", {
            type: "stream-start",
            workspaceId,
            messageId: streamInfo.messageId,
            model: streamInfo.model,
            historySequence: streamInfo.historySequence,
        });
        // Replay accumulated parts as events
        for (const part of streamInfo.parts) {
            if (part.type === "text") {
                this.emit("stream-delta", {
                    type: "stream-delta",
                    workspaceId,
                    messageId: streamInfo.messageId,
                    delta: part.text,
                });
            }
            else if (part.type === "reasoning") {
                this.emit("reasoning-delta", {
                    type: "reasoning-delta",
                    workspaceId,
                    messageId: streamInfo.messageId,
                    delta: part.text,
                });
            }
            else if (part.type === "dynamic-tool") {
                // Emit tool-call-start
                this.emit("tool-call-start", {
                    type: "tool-call-start",
                    workspaceId,
                    messageId: streamInfo.messageId,
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    args: part.input,
                });
                // If tool has output, emit tool-call-end
                if (part.state === "output-available") {
                    this.emit("tool-call-end", {
                        type: "tool-call-end",
                        workspaceId,
                        messageId: streamInfo.messageId,
                        toolCallId: part.toolCallId,
                        toolName: part.toolName,
                        result: part.output,
                    });
                }
            }
        }
    }
}
exports.StreamManager = StreamManager;
//# sourceMappingURL=streamManager.js.map
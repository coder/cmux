import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import {
  streamText,
  stepCountIs,
  type ModelMessage,
  type LanguageModel,
  type Tool,
  LoadAPIKeyError,
  APICallError,
  RetryError,
} from "ai";
import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import type { Result } from "@/types/result";
import { Ok, Err } from "@/types/result";
import { log } from "./log";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  ErrorEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  CompletedMessagePart,
} from "@/types/stream";
import type { SendMessageError, StreamErrorType } from "@/types/errors";
import type { CmuxMetadata, CmuxMessage } from "@/types/message";
import type { PartialService } from "./partialService";
import type { HistoryService } from "./historyService";
import { AsyncMutex } from "@/utils/concurrency/asyncMutex";
import type { ToolPolicy } from "@/utils/tools/toolPolicy";

// Type definitions for stream parts with extended properties
interface ReasoningDeltaPart {
  type: "reasoning-delta";
  text?: string;
}

// Branded types for compile-time safety
type WorkspaceId = string & { __brand: "WorkspaceId" };
type StreamToken = string & { __brand: "StreamToken" };

// Stream state enum for exhaustive checking
enum StreamState {
  IDLE = "idle",
  STARTING = "starting",
  STREAMING = "streaming",
  STOPPING = "stopping",
  ERROR = "error",
}

/**
 * Strip encryptedContent from web search results to reduce token usage.
 * The encrypted page content can be massive (4000+ chars per result) and isn't
 * needed for model context. Keep URL, title, and pageAge for reference.
 */
function stripEncryptedContent(output: unknown): unknown {
  // Check if output is JSON with a value array (web search results)
  if (
    typeof output === "object" &&
    output !== null &&
    "type" in output &&
    output.type === "json" &&
    "value" in output &&
    Array.isArray(output.value)
  ) {
    // Strip encryptedContent from each search result
    const strippedValue = output.value.map((item: unknown) => {
      if (item && typeof item === "object" && "encryptedContent" in item) {
        // Remove encryptedContent but keep other fields
        const { encryptedContent, ...rest } = item as Record<string, unknown>;
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

// Comprehensive stream info
interface WorkspaceStreamInfo {
  state: StreamState;
  streamResult: Awaited<ReturnType<typeof streamText>>;
  abortController: AbortController;
  messageId: string;
  token: StreamToken;
  startTime: number;
  model: string;
  initialMetadata?: Partial<CmuxMetadata>;
  historySequence: number;
  // Track accumulated parts for partial message (includes reasoning, text, and tools)
  parts: CompletedMessagePart[];
  // Track last partial write time for throttling
  lastPartialWriteTime: number;
  // Throttle timer for partial writes
  partialWriteTimer?: NodeJS.Timeout;
  // Track in-flight write to serialize writes
  partialWritePromise?: Promise<void>;
  // Track background processing promise for guaranteed cleanup
  processingPromise: Promise<void>;
}

/**
 * StreamManager - Handles all streaming operations with type safety and atomic operations
 *
 * Key invariants:
 * - Only one active stream per workspace at any time
 * - Atomic stream creation/cancellation operations
 * - Guaranteed resource cleanup in all code paths
 */
export class StreamManager extends EventEmitter {
  private workspaceStreams = new Map<WorkspaceId, WorkspaceStreamInfo>();
  private streamLocks = new Map<WorkspaceId, AsyncMutex>();
  private readonly PARTIAL_WRITE_THROTTLE_MS = 500;
  private readonly historyService: HistoryService;
  private readonly partialService: PartialService;

  constructor(historyService: HistoryService, partialService: PartialService) {
    super();
    this.historyService = historyService;
    this.partialService = partialService;
  }

  /**
   * Write the current partial message to disk (throttled by mtime)
   * Ensures writes happen during rapid streaming (crash-resilient)
   */
  private async schedulePartialWrite(
    workspaceId: WorkspaceId,
    streamInfo: WorkspaceStreamInfo
  ): Promise<void> {
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
  private async flushPartialWrite(
    workspaceId: WorkspaceId,
    streamInfo: WorkspaceStreamInfo
  ): Promise<void> {
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
        const partialMessage: CmuxMessage = {
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

        await this.partialService.writePartial(workspaceId as string, partialMessage);
        streamInfo.lastPartialWriteTime = Date.now();
      } catch (error) {
        log.error("Failed to write partial message:", error);
      } finally {
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
  private async ensureStreamSafety(workspaceId: WorkspaceId): Promise<StreamToken> {
    const existing = this.workspaceStreams.get(workspaceId);

    if (existing && existing.state !== StreamState.IDLE) {
      await this.cancelStreamSafely(workspaceId, existing);
    }

    // Generate unique token for this stream
    return randomUUID() as StreamToken;
  }

  /**
   * Extracts usage and duration metadata from stream result.
   *
   * Usage is only available after stream completes naturally.
   * On abort, the usage promise may hang - we use a timeout to return quickly.
   */
  private async getStreamMetadata(
    streamInfo: WorkspaceStreamInfo,
    timeoutMs = 1000
  ): Promise<{ usage?: LanguageModelV2Usage; duration: number }> {
    let usage = undefined;
    try {
      // Race usage retrieval against timeout to prevent hanging on abort
      usage = await Promise.race([
        streamInfo.streamResult.usage,
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
      ]);
    } catch (error) {
      log.debug("Could not retrieve usage:", error);
    }

    return {
      usage,
      duration: Date.now() - streamInfo.startTime,
    };
  }

  /**
   * Safely cancels an existing stream with proper cleanup
   *
   * CRITICAL: Waits for the processing promise to complete before cleanup.
   * This ensures the old stream fully exits before a new stream can start,
   * preventing concurrent streams and race conditions.
   */
  private async cancelStreamSafely(
    workspaceId: WorkspaceId,
    streamInfo: WorkspaceStreamInfo
  ): Promise<void> {
    try {
      streamInfo.state = StreamState.STOPPING;

      // Flush any pending partial write immediately (preserves work on interruption)
      await this.flushPartialWrite(workspaceId, streamInfo);

      streamInfo.abortController.abort();

      // CRITICAL: Wait for processing to fully complete before cleanup
      // This prevents race conditions where the old stream is still running
      // while a new stream starts (e.g., old stream writing to partial.json)
      await streamInfo.processingPromise;

      // Get usage and duration metadata (usage may be undefined if aborted early)
      const { usage, duration } = await this.getStreamMetadata(streamInfo);

      // Emit abort event with usage if available
      this.emit("stream-abort", {
        type: "stream-abort",
        workspaceId: workspaceId as string,
        messageId: streamInfo.messageId,
        metadata: { usage, duration },
      });

      // Clean up immediately
      this.workspaceStreams.delete(workspaceId);
    } catch (error) {
      console.error("Error during stream cancellation:", error);
      // Force cleanup even if cancellation fails
      this.workspaceStreams.delete(workspaceId);
    }
  }

  /**
   * Atomically creates a new stream with all necessary setup
   */
  private createStreamAtomically(
    workspaceId: WorkspaceId,
    streamToken: StreamToken,
    messages: ModelMessage[],
    model: LanguageModel,
    modelString: string,
    abortSignal: AbortSignal | undefined,
    system: string,
    historySequence: number,
    tools?: Record<string, Tool>,
    initialMetadata?: Partial<CmuxMetadata>,
    providerOptions?: Record<string, unknown>,
    maxOutputTokens?: number,
    toolPolicy?: ToolPolicy
  ): WorkspaceStreamInfo {
    // Create abort controller for this specific stream
    const abortController = new AbortController();

    // Link external abort signal
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => abortController.abort());
    }

    // Determine toolChoice based on toolPolicy
    // If a tool is required (tools object has exactly one tool after applyToolPolicy),
    // force the model to use it with toolChoice: { type: "required", toolName: "..." }
    let toolChoice: { type: "required"; toolName: string } | undefined;
    if (tools && toolPolicy) {
      // Check if any filter has "require" action
      const hasRequireAction = toolPolicy.some((filter) => filter.action === "require");
      if (hasRequireAction && Object.keys(tools).length === 1) {
        const requiredToolName = Object.keys(tools)[0];
        toolChoice = { type: "required", toolName: requiredToolName };
        log.debug("Setting toolChoice to required", { toolName: requiredToolName });
      }
    }

    // Start streaming - this can throw immediately if API key is missing
    let streamResult;
    try {
      streamResult = streamText({
        model,
        messages,
        system,
        abortSignal: abortController.signal,
        tools,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        toolChoice: toolChoice as any, // Force tool use when required by policy
        // When toolChoice is set (required tool), limit to 1 step to prevent infinite loops
        // Otherwise allow unlimited steps for multi-turn tool use
        ...(toolChoice ? { maxSteps: 1 } : { stopWhen: stepCountIs(100000) }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        providerOptions: providerOptions as any, // Pass provider-specific options (thinking/reasoning config)
        // Default to 32000 tokens if not specified (Anthropic defaults to 4096)
        maxOutputTokens: maxOutputTokens ?? 32000,
      });
    } catch (error) {
      // Clean up abort controller if stream creation fails
      abortController.abort();
      // Re-throw the error to be caught by startStream
      throw error;
    }

    const messageId = `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const streamInfo: WorkspaceStreamInfo = {
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
   * Complete a tool call by updating its part and emitting tool-call-end event
   */
  private completeToolCall(
    workspaceId: WorkspaceId,
    streamInfo: WorkspaceStreamInfo,
    toolCalls: Map<
      string,
      { toolCallId: string; toolName: string; input: unknown; output?: unknown }
    >,
    toolCallId: string,
    toolName: string,
    output: unknown
  ): void {
    // Find and update the existing tool part
    const existingPartIndex = streamInfo.parts.findIndex(
      (p) => p.type === "dynamic-tool" && p.toolCallId === toolCallId
    );

    if (existingPartIndex !== -1) {
      const existingPart = streamInfo.parts[existingPartIndex];
      if (existingPart.type === "dynamic-tool") {
        streamInfo.parts[existingPartIndex] = {
          ...existingPart,
          state: "output-available" as const,
          output,
        };
      }
    } else {
      // Fallback: part not found (shouldn't happen for errors, but can happen for results)
      // This case exists in tool-result but we'll keep it for robustness
      const toolCall = toolCalls.get(toolCallId);
      if (toolCall) {
        streamInfo.parts.push({
          type: "dynamic-tool" as const,
          toolCallId,
          toolName,
          state: "output-available" as const,
          input: toolCall.input,
          output,
        });
      }
    }

    // Emit tool-call-end event
    this.emit("tool-call-end", {
      type: "tool-call-end",
      workspaceId: workspaceId as string,
      messageId: streamInfo.messageId,
      toolCallId,
      toolName,
      result: output,
    } as ToolCallEndEvent);

    // Schedule partial write
    void this.schedulePartialWrite(workspaceId, streamInfo);
  }

  /**
   * Processes a stream with guaranteed cleanup, regardless of success or failure
   */
  private async processStreamWithCleanup(
    workspaceId: WorkspaceId,
    streamInfo: WorkspaceStreamInfo,
    historySequence: number
  ): Promise<void> {
    try {
      // Update state to streaming
      streamInfo.state = StreamState.STREAMING;

      // Emit stream start event
      this.emit("stream-start", {
        type: "stream-start",
        workspaceId: workspaceId as string,
        messageId: streamInfo.messageId,
        model: streamInfo.model,
        historySequence,
      } as StreamStartEvent);

      // Use fullStream to capture all events including tool calls
      const toolCalls = new Map<
        string,
        { toolCallId: string; toolName: string; input: unknown; output?: unknown }
      >();

      for await (const part of streamInfo.streamResult.fullStream) {
        // Check if stream was cancelled BEFORE processing any parts
        // This improves interruption responsiveness by catching aborts earlier
        if (streamInfo.abortController.signal.aborted) {
          log.debug("streamManager: Stream aborted, breaking from loop");
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
              workspaceId: workspaceId as string,
              messageId: streamInfo.messageId,
              delta: part.text,
            } as StreamDeltaEvent);

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
            const delta = (part as ReasoningDeltaPart).text ?? "";

            // Append each delta as a new part (merging happens at display time)
            streamInfo.parts.push({
              type: "reasoning",
              text: delta,
            });

            this.emit("reasoning-delta", {
              type: "reasoning-delta",
              workspaceId: workspaceId as string,
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
              workspaceId: workspaceId as string,
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

            // Note: Tool availability is handled by the SDK, which emits tool-error events
            // for unavailable tools. No need to check here.

            // IMPORTANT: Add tool part to streamInfo.parts immediately (not just on completion)
            // This ensures in-progress tool calls are saved to partial.json if stream is interrupted
            const toolPart = {
              type: "dynamic-tool" as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              state: "input-available" as const,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              input: part.input,
            };
            streamInfo.parts.push(toolPart);

            this.emit("tool-call-start", {
              type: "tool-call-start",
              workspaceId: workspaceId as string,
              messageId: streamInfo.messageId,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.input,
            } as ToolCallStartEvent);
            break;
          }

          case "tool-result": {
            // Tool call completed successfully
            const toolCall = toolCalls.get(part.toolCallId);
            if (toolCall) {
              // Strip encrypted content from web search results before storing
              const strippedOutput = stripEncryptedContent(part.output);
              toolCall.output = strippedOutput;

              // Use shared completion logic
              this.completeToolCall(
                workspaceId,
                streamInfo,
                toolCalls,
                part.toolCallId,
                part.toolName,
                strippedOutput
              );
            }
            break;
          }

          // Handle tool-error parts from the stream (AI SDK 5.0+)
          // These are emitted when tool execution fails (e.g., tool doesn't exist)
          case "tool-error": {
            const toolErrorPart = part as {
              toolCallId: string;
              toolName: string;
              error: unknown;
            };

            log.error(`Tool execution error for '${toolErrorPart.toolName}'`, {
              toolCallId: toolErrorPart.toolCallId,
              error: toolErrorPart.error,
            });

            // Format error output
            const errorOutput = {
              error:
                typeof toolErrorPart.error === "string"
                  ? toolErrorPart.error
                  : toolErrorPart.error instanceof Error
                    ? toolErrorPart.error.message
                    : JSON.stringify(toolErrorPart.error),
            };

            // Use shared completion logic
            this.completeToolCall(
              workspaceId,
              streamInfo,
              toolCalls,
              toolErrorPart.toolCallId,
              toolErrorPart.toolName,
              errorOutput
            );
            break;
          }

          // Handle error parts from the stream (e.g., OpenAI context_length_exceeded)
          case "error": {
            // Capture the error and immediately throw to trigger error handling
            // Error parts are structured errors from the AI SDK
            const errorPart = part as { error: unknown };

            // Try to extract error message from various possible structures
            let errorMessage: string | undefined;

            if (errorPart.error instanceof Error) {
              throw errorPart.error;
            } else if (typeof errorPart.error === "object" && errorPart.error !== null) {
              const errorObj = errorPart.error as Record<string, unknown>;

              // Check for nested error object with message (OpenAI format)
              if (errorObj.error && typeof errorObj.error === "object" && errorObj.error !== null) {
                const nestedError = errorObj.error as Record<string, unknown>;
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
            } else {
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
        // Get usage, duration, and provider metadata from stream result
        const { usage, duration } = await this.getStreamMetadata(streamInfo);
        const providerMetadata = await streamInfo.streamResult.providerMetadata;

        // Emit stream end event with parts preserved in temporal order
        const streamEndEvent: StreamEndEvent = {
          type: "stream-end",
          workspaceId: workspaceId as string,
          messageId: streamInfo.messageId,
          metadata: {
            ...streamInfo.initialMetadata, // AIService-provided metadata (systemMessageTokens, etc)
            model: streamInfo.model,
            usage, // AI SDK normalized usage
            providerMetadata, // Raw provider metadata
            duration,
          },
          parts: streamInfo.parts, // Parts array with temporal ordering (includes reasoning)
        };

        this.emit("stream-end", streamEndEvent);

        // Update history with final message (only if there are parts)
        if (streamInfo.parts && streamInfo.parts.length > 0) {
          const finalAssistantMessage: CmuxMessage = {
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
          await this.partialService.deletePartial(workspaceId as string);

          // Update the placeholder message in chat.jsonl with final content
          await this.historyService.updateHistory(workspaceId as string, finalAssistantMessage);
        }
      }
    } catch (error) {
      streamInfo.state = StreamState.ERROR;

      // Log the actual error for debugging
      console.error("Stream processing error:", error);

      // Extract error message (errors thrown from 'error' parts already have the correct message)
      let errorMessage: string = error instanceof Error ? error.message : String(error);
      let actualError: unknown = error;

      // For categorization, use the cause if available (preserves the original error structure)
      if (error instanceof Error && error.cause) {
        actualError = error.cause;
      }

      let errorType = this.categorizeError(actualError);

      // Detect and enhance model-not-found errors
      if (APICallError.isInstance(actualError)) {
        const apiError = actualError;

        // Type guard for error data structure
        const hasErrorProperty = (
          data: unknown
        ): data is { error: { code?: string; type?: string } } => {
          return (
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "object" &&
            data.error !== null
          );
        };

        // OpenAI: 400 with error.code === 'model_not_found'
        const isOpenAIModelError =
          apiError.statusCode === 400 &&
          hasErrorProperty(apiError.data) &&
          apiError.data.error.code === "model_not_found";

        // Anthropic: 404 with error.type === 'not_found_error'
        const isAnthropicModelError =
          apiError.statusCode === 404 &&
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
      if (
        errorMessage.toLowerCase().includes("api key") ||
        errorMessage.toLowerCase().includes("api_key") ||
        errorMessage.toLowerCase().includes("anthropic_api_key")
      ) {
        errorType = "authentication";
      }

      // Write error metadata to partial.json for persistence across reloads
      const errorPartialMessage: CmuxMessage = {
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
      void this.partialService.writePartial(workspaceId as string, errorPartialMessage);

      // Emit error event
      this.emit("error", {
        type: "error",
        workspaceId: workspaceId as string,
        messageId: streamInfo.messageId,
        error: errorMessage,
        errorType: errorType,
      } as ErrorEvent);
    } finally {
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
  private convertToSendMessageError(error: unknown): SendMessageError {
    // Check for specific AI SDK errors using type guards
    if (LoadAPIKeyError.isInstance(error)) {
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
  private categorizeError(error: unknown): StreamErrorType {
    // Use AI SDK error type guards first
    if (LoadAPIKeyError.isInstance(error)) {
      return "authentication";
    }
    if (APICallError.isInstance(error)) {
      if (error.statusCode === 401) return "authentication";
      if (error.statusCode === 429) return "rate_limit";
      if (error.statusCode && error.statusCode >= 500) return "server_error";

      // Check for Anthropic context exceeded errors
      if (error.message.includes("prompt is too long:")) {
        return "context_exceeded";
      }

      return "api";
    }
    if (RetryError.isInstance(error)) {
      return "retry_failed";
    }

    // Check for OpenAI/Anthropic structured error format (from error.cause)
    // Structure: { error: { code: 'context_length_exceeded', type: '...', message: '...' } }
    if (
      typeof error === "object" &&
      error !== null &&
      "error" in error &&
      typeof error.error === "object" &&
      error.error !== null
    ) {
      const structuredError = error.error as { code?: string; type?: string };

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
      } else if (message.includes("network") || message.includes("fetch")) {
        return "network";
      } else if (
        message.includes("token") ||
        message.includes("context") ||
        message.includes("too long") ||
        message.includes("maximum")
      ) {
        return "context_exceeded";
      } else if (message.includes("quota") || message.includes("limit")) {
        return "quota";
      } else if (message.includes("auth") || message.includes("key")) {
        return "authentication";
      } else {
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
  async startStream(
    workspaceId: string,
    messages: ModelMessage[],
    model: LanguageModel,
    modelString: string,
    historySequence: number,
    system: string,
    abortSignal?: AbortSignal,
    tools?: Record<string, Tool>,
    initialMetadata?: Partial<CmuxMetadata>,
    providerOptions?: Record<string, unknown>,
    maxOutputTokens?: number,
    toolPolicy?: ToolPolicy
  ): Promise<Result<StreamToken, SendMessageError>> {
    const typedWorkspaceId = workspaceId as WorkspaceId;

    // Get or create mutex for this workspace
    if (!this.streamLocks.has(typedWorkspaceId)) {
      this.streamLocks.set(typedWorkspaceId, new AsyncMutex());
    }
    const mutex = this.streamLocks.get(typedWorkspaceId)!;

    try {
      // Acquire lock - guarantees only one startStream per workspace
      // Lock is automatically released when scope exits via Symbol.asyncDispose
      await using _lock = await mutex.acquire();

      // DEBUG: Log stream start
      log.debug(
        `[STREAM START] workspaceId=${workspaceId} historySequence=${historySequence} model=${modelString}`
      );

      // Step 1: Atomic safety check (cancels any existing stream and waits for full exit)
      const streamToken = await this.ensureStreamSafety(typedWorkspaceId);
      // Step 2: Atomic stream creation and registration
      const streamInfo = this.createStreamAtomically(
        typedWorkspaceId,
        streamToken,
        messages,
        model,
        modelString,
        abortSignal,
        system,
        historySequence,
        tools,
        initialMetadata,
        providerOptions,
        maxOutputTokens,
        toolPolicy
      );

      // Step 3: Track the processing promise for guaranteed cleanup
      // This allows cancelStreamSafely to wait for full exit
      streamInfo.processingPromise = this.processStreamWithCleanup(
        typedWorkspaceId,
        streamInfo,
        historySequence
      ).catch((error) => {
        console.error("Unexpected error in stream processing:", error);
      });

      return Ok(streamToken);
    } catch (error) {
      // Guaranteed cleanup on any failure
      this.workspaceStreams.delete(typedWorkspaceId);
      // Convert to strongly-typed error
      return Err(this.convertToSendMessageError(error));
    }
  }

  /**
   * Stops an active stream for a workspace
   */
  async stopStream(workspaceId: string): Promise<Result<void>> {
    const typedWorkspaceId = workspaceId as WorkspaceId;

    try {
      const streamInfo = this.workspaceStreams.get(typedWorkspaceId);
      if (streamInfo) {
        await this.cancelStreamSafely(typedWorkspaceId, streamInfo);
      }
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to stop stream: ${message}`);
    }
  }

  /**
   * Gets the current stream state for a workspace
   */
  getStreamState(workspaceId: string): StreamState {
    const typedWorkspaceId = workspaceId as WorkspaceId;
    const streamInfo = this.workspaceStreams.get(typedWorkspaceId);
    return streamInfo?.state ?? StreamState.IDLE;
  }

  /**
   * Checks if a workspace currently has an active stream
   */
  isStreaming(workspaceId: string): boolean {
    const state = this.getStreamState(workspaceId);
    return state === StreamState.STARTING || state === StreamState.STREAMING;
  }

  /**
   * Gets all active workspace streams (for debugging/monitoring)
   */
  getActiveStreams(): string[] {
    return Array.from(this.workspaceStreams.keys()).map((id) => id as string);
  }

  /**
   * Gets the current stream info for a workspace if actively streaming
   * Returns undefined if no active stream exists
   * Used to re-establish streaming context on frontend reconnection
   */
  getStreamInfo(
    workspaceId: string
  ):
    | { messageId: string; model: string; historySequence: number; parts: CompletedMessagePart[] }
    | undefined {
    const typedWorkspaceId = workspaceId as WorkspaceId;
    const streamInfo = this.workspaceStreams.get(typedWorkspaceId);

    // Only return info if stream is actively running
    if (
      streamInfo &&
      (streamInfo.state === StreamState.STARTING || streamInfo.state === StreamState.STREAMING)
    ) {
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
  replayStream(workspaceId: string): void {
    const typedWorkspaceId = workspaceId as WorkspaceId;
    const streamInfo = this.workspaceStreams.get(typedWorkspaceId);

    // Only replay if stream is actively running
    if (
      !streamInfo ||
      (streamInfo.state !== StreamState.STARTING && streamInfo.state !== StreamState.STREAMING)
    ) {
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
      } else if (part.type === "reasoning") {
        this.emit("reasoning-delta", {
          type: "reasoning-delta",
          workspaceId,
          messageId: streamInfo.messageId,
          delta: part.text,
        });
      } else if (part.type === "dynamic-tool") {
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

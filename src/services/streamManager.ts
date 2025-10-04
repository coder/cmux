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
import type { Result } from "../types/result";
import { Ok, Err } from "../types/result";
import { log } from "./log";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  ErrorEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  CompletedMessagePart,
} from "../types/stream";
import type { SendMessageError } from "../types/errors";
import type { CmuxMetadata, CmuxMessage } from "../types/message";
import { getTokenizerForModel } from "../utils/tokenizer";
import type { PartialService } from "./partialService";
import type { HistoryService } from "./historyService";

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
   * Safely cancels an existing stream with proper cleanup
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

      // Emit abort event
      this.emit("stream-abort", {
        type: "stream-abort",
        workspaceId: workspaceId as string,
        messageId: streamInfo.messageId,
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
    providerOptions?: Record<string, unknown>
  ): WorkspaceStreamInfo {
    // Create abort controller for this specific stream
    const abortController = new AbortController();

    // Link external abort signal
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => abortController.abort());
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
        stopWhen: stepCountIs(1000), // Allow up to 1000 steps (effectively unlimited)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        providerOptions: providerOptions as any, // Pass provider-specific options (thinking/reasoning config)
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
    };

    // Atomically register the stream
    this.workspaceStreams.set(workspaceId, streamInfo);

    return streamInfo;
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
            // Tool call completed - update the existing tool part with output
            const toolCall = toolCalls.get(part.toolCallId);
            if (toolCall) {
              toolCall.output = part.output;

              // Find and update the existing tool part (added during tool-call)
              const existingPartIndex = streamInfo.parts.findIndex(
                (p) => p.type === "dynamic-tool" && p.toolCallId === part.toolCallId
              );

              if (existingPartIndex !== -1) {
                // Update existing part with output
                const existingPart = streamInfo.parts[existingPartIndex];
                if (existingPart.type === "dynamic-tool") {
                  streamInfo.parts[existingPartIndex] = {
                    ...existingPart,
                    state: "output-available" as const,
                    output: part.output,
                  };
                }
              } else {
                // Fallback: part not found (shouldn't happen), add it
                streamInfo.parts.push({
                  type: "dynamic-tool" as const,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  state: "output-available" as const,
                  input: toolCall.input,
                  output: part.output,
                });
              }

              this.emit("tool-call-end", {
                type: "tool-call-end",
                workspaceId: workspaceId as string,
                messageId: streamInfo.messageId,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                result: part.output,
              } as ToolCallEndEvent);

              // Schedule partial write after tool result (throttled, fire-and-forget)
              void this.schedulePartialWrite(workspaceId, streamInfo);
            }
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
        // Get usage information from the stream result
        const usage = await streamInfo.streamResult.usage;

        // Calculate reasoning tokens from the reasoning part if present
        let reasoningTokens = usage?.reasoningTokens;
        const reasoningPart = streamInfo.parts.find((p) => p.type === "reasoning");
        if (reasoningTokens === undefined && reasoningPart?.type === "reasoning") {
          // API didn't provide reasoning tokens (e.g., Anthropic includes them in outputTokens)
          // Estimate from the reasoning part text
          try {
            const tokenizer = getTokenizerForModel(streamInfo.model);
            reasoningTokens = tokenizer.countTokens(reasoningPart.text);
            log.debug("streamManager: Estimated reasoning tokens from part", {
              estimatedTokens: reasoningTokens,
              textLength: reasoningPart.text.length,
            });
          } catch (err) {
            log.debug("streamManager: Failed to estimate reasoning tokens", err);
          }
        }

        // Adjust usage to subtract reasoning tokens from outputTokens if needed
        let adjustedUsage = usage;
        if (reasoningTokens !== undefined && usage?.outputTokens !== undefined) {
          adjustedUsage = {
            ...usage,
            outputTokens: Math.max(0, usage.outputTokens - reasoningTokens),
            reasoningTokens,
          };
        }

        // Get provider metadata which contains cache statistics
        const providerMetadata = await streamInfo.streamResult.providerMetadata;

        // Fix cachedInputTokens from Anthropic provider metadata if not properly populated
        // The AI SDK's Anthropic provider doesn't populate usage.cachedInputTokens from
        // Anthropic's cache_read_input_tokens field, so we need to extract it manually
        if (
          adjustedUsage &&
          providerMetadata?.anthropic &&
          typeof providerMetadata.anthropic === "object" &&
          "usage" in providerMetadata.anthropic
        ) {
          const anthropicUsage = providerMetadata.anthropic.usage as Record<string, unknown>;
          if (typeof anthropicUsage.cache_read_input_tokens === "number") {
            adjustedUsage = {
              ...adjustedUsage,
              cachedInputTokens: anthropicUsage.cache_read_input_tokens,
            };
          }
        }

        // Emit stream end event with parts preserved in temporal order
        const streamEndEvent: StreamEndEvent = {
          type: "stream-end",
          workspaceId: workspaceId as string,
          messageId: streamInfo.messageId,
          metadata: {
            ...streamInfo.initialMetadata, // AIService-provided metadata (systemMessageTokens, etc)
            usage: adjustedUsage,
            tokens: adjustedUsage?.totalTokens,
            model: streamInfo.model,
            providerMetadata,
            duration: Date.now() - streamInfo.startTime,
            reasoningTokens,
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
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      let actualError: unknown = error;

      // For categorization, use the cause if available (preserves the original error structure)
      if (error instanceof Error && error.cause) {
        actualError = error.cause;
      }

      let errorType = this.categorizeError(actualError);

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
  private categorizeError(error: unknown): string {
    // Use AI SDK error type guards first
    if (LoadAPIKeyError.isInstance(error)) {
      return "authentication";
    }
    if (APICallError.isInstance(error)) {
      if (error.statusCode === 401) return "authentication";
      if (error.statusCode === 429) return "rate_limit";
      if (error.statusCode && error.statusCode >= 500) return "server_error";
      return "api";
    }
    if (RetryError.isInstance(error)) {
      return "retry_failed";
    }

    // Fall back to string matching for other errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (error.name === "AbortError" || message.includes("abort")) {
        return "aborted";
      } else if (message.includes("network") || message.includes("fetch")) {
        return "network";
      } else if (message.includes("token") || message.includes("limit")) {
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
    providerOptions?: Record<string, unknown>
  ): Promise<Result<StreamToken, SendMessageError>> {
    const typedWorkspaceId = workspaceId as WorkspaceId;

    try {
      // DEBUG: Log stream start
      log.debug(
        `[STREAM START] workspaceId=${workspaceId} historySequence=${historySequence} model=${modelString}`
      );

      // Step 1: Atomic safety check (cancels any existing stream)
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
        providerOptions
      );

      // Step 3: Process stream with guaranteed cleanup (runs in background)
      this.processStreamWithCleanup(typedWorkspaceId, streamInfo, historySequence).catch(
        (error) => {
          console.error("Unexpected error in stream processing:", error);
        }
      );

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
}

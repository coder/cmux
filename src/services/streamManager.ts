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
import { Result, Ok, Err } from "../types/result";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  ErrorEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
} from "../types/aiEvents";
import type { SendMessageError } from "../types/errors";

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
  private async createStreamAtomically(
    workspaceId: WorkspaceId,
    streamToken: StreamToken,
    messages: ModelMessage[],
    model: LanguageModel,
    modelString: string,
    abortSignal: AbortSignal,
    tools?: Record<string, Tool>
  ): Promise<WorkspaceStreamInfo> {
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
        abortSignal: abortController.signal,
        tools,
        stopWhen: stepCountIs(1000), // Allow up to 1000 steps (effectively unlimited)
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
    streamInfo: WorkspaceStreamInfo
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
      } as StreamStartEvent);

      // Track the temporal structure of parts as they occur
      const parts: Array<
        | { type: "text"; text: string; state: "done" }
        | {
            type: "dynamic-tool";
            toolCallId: string;
            toolName: string;
            state: "output-available";
            input: unknown;
            output?: unknown;
          }
      > = [];
      let currentTextBuffer = "";

      // Use fullStream to capture all events including tool calls
      const toolCalls = new Map<
        string,
        { toolCallId: string; toolName: string; input: unknown; output?: unknown }
      >();

      for await (const part of streamInfo.streamResult.fullStream) {
        // Check if stream was cancelled
        if (streamInfo.abortController.signal.aborted) {
          break;
        }

        switch (part.type) {
          case "text-delta":
            currentTextBuffer += part.text;
            this.emit("stream-delta", {
              type: "stream-delta",
              workspaceId: workspaceId as string,
              messageId: streamInfo.messageId,
              delta: part.text,
            } as StreamDeltaEvent);
            break;

          case "tool-call":
            // Save any accumulated text before the tool call
            if (currentTextBuffer) {
              parts.push({ type: "text", text: currentTextBuffer, state: "done" });
              currentTextBuffer = "";
            }

            // Tool call started
            toolCalls.set(part.toolCallId, {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
            });
            this.emit("tool-call-start", {
              type: "tool-call-start",
              workspaceId: workspaceId as string,
              messageId: streamInfo.messageId,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.input,
            } as ToolCallStartEvent);
            break;

          case "tool-result": {
            // Tool call completed
            const toolCall = toolCalls.get(part.toolCallId);
            if (toolCall) {
              toolCall.output = part.output;
              // Add tool part to parts array
              parts.push({
                type: "dynamic-tool",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                state: "output-available",
                input: toolCall.input,
                output: part.output,
              });
              this.emit("tool-call-end", {
                type: "tool-call-end",
                workspaceId: workspaceId as string,
                messageId: streamInfo.messageId,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                result: part.output,
              } as ToolCallEndEvent);
            }
            break;
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

      // Save any remaining text after the last tool call
      if (currentTextBuffer) {
        parts.push({ type: "text", text: currentTextBuffer, state: "done" });
      }

      // Check if stream completed successfully
      if (!streamInfo.abortController.signal.aborted) {
        // Get usage information
        const usage = await streamInfo.streamResult.usage;

        // Emit stream end event with parts preserved in temporal order
        this.emit("stream-end", {
          type: "stream-end",
          workspaceId: workspaceId as string,
          messageId: streamInfo.messageId,
          parts, // Parts array with temporal ordering
          usage,
          model: streamInfo.model,
        } as StreamEndEvent);
      }
    } catch (error) {
      streamInfo.state = StreamState.ERROR;

      // Log the actual error for debugging
      console.error("Stream processing error:", error);

      // Check if this is actually a LoadAPIKeyError wrapped in another error
      let errorMessage = error instanceof Error ? error.message : String(error);
      let errorType = this.categorizeError(error);

      // If we detect API key issues in the error message, override the type
      if (
        errorMessage.toLowerCase().includes("api key") ||
        errorMessage.toLowerCase().includes("api_key") ||
        errorMessage.toLowerCase().includes("anthropic_api_key")
      ) {
        errorType = "authentication";
      }

      // Emit error event
      this.emit("error", {
        type: "error",
        workspaceId: workspaceId as string,
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
    abortSignal?: AbortSignal,
    tools?: Record<string, Tool>
  ): Promise<Result<StreamToken, SendMessageError>> {
    const typedWorkspaceId = workspaceId as WorkspaceId;

    try {
      // Step 1: Atomic safety check (cancels any existing stream)
      const streamToken = await this.ensureStreamSafety(typedWorkspaceId);

      // Step 2: Atomic stream creation and registration
      const streamInfo = await this.createStreamAtomically(
        typedWorkspaceId,
        streamToken,
        messages,
        model,
        modelString,
        abortSignal || new AbortController().signal,
        tools
      );

      // Step 3: Process stream with guaranteed cleanup (runs in background)
      this.processStreamWithCleanup(typedWorkspaceId, streamInfo).catch((error) => {
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
}

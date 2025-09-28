import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type ModelMessage } from "ai";
import { Result, Ok, Err } from "../types/result";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  ErrorEvent,
} from "../types/aiEvents";

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
  private model = anthropic("claude-opus-4-1");

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
    abortSignal: AbortSignal
  ): Promise<WorkspaceStreamInfo> {
    // Create abort controller for this specific stream
    const abortController = new AbortController();

    // Link external abort signal
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => abortController.abort());
    }

    // Start streaming
    const streamResult = streamText({
      model: this.model,
      messages,
      abortSignal: abortController.signal,
    });

    const messageId = `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const streamInfo: WorkspaceStreamInfo = {
      state: StreamState.STARTING,
      streamResult,
      abortController,
      messageId,
      token: streamToken,
      startTime: Date.now(),
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
      } as StreamStartEvent);

      // Stream the text
      let fullContent = "";
      for await (const chunk of streamInfo.streamResult.textStream) {
        // Check if stream was cancelled
        if (streamInfo.abortController.signal.aborted) {
          break;
        }

        fullContent += chunk;
        this.emit("stream-delta", {
          type: "stream-delta",
          workspaceId: workspaceId as string,
          messageId: streamInfo.messageId,
          delta: chunk,
        } as StreamDeltaEvent);
      }

      // Check if stream completed successfully
      if (!streamInfo.abortController.signal.aborted) {
        // Get usage information
        const usage = await streamInfo.streamResult.usage;

        // Emit stream end event
        this.emit("stream-end", {
          type: "stream-end",
          workspaceId: workspaceId as string,
          messageId: streamInfo.messageId,
          content: fullContent,
          usage,
        } as StreamEndEvent);
      }
    } catch (error) {
      streamInfo.state = StreamState.ERROR;

      // Emit error event
      this.emit("error", {
        type: "error",
        workspaceId: workspaceId as string,
        error: error instanceof Error ? error.message : String(error),
        errorType: this.categorizeError(error),
      } as ErrorEvent);
    } finally {
      // Guaranteed cleanup in all code paths
      this.workspaceStreams.delete(workspaceId);
    }
  }

  /**
   * Categorizes errors for better error handling
   */
  private categorizeError(error: unknown): string {
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
    abortSignal?: AbortSignal
  ): Promise<Result<StreamToken>> {
    const typedWorkspaceId = workspaceId as WorkspaceId;

    try {
      // Step 1: Atomic safety check (cancels any existing stream)
      const streamToken = await this.ensureStreamSafety(typedWorkspaceId);

      // Step 2: Atomic stream creation and registration
      const streamInfo = await this.createStreamAtomically(
        typedWorkspaceId,
        streamToken,
        messages,
        abortSignal || new AbortController().signal
      );

      // Step 3: Process stream with guaranteed cleanup (runs in background)
      this.processStreamWithCleanup(typedWorkspaceId, streamInfo).catch((error) => {
        console.error("Unexpected error in stream processing:", error);
      });

      return Ok(streamToken);
    } catch (error) {
      // Guaranteed cleanup on any failure
      this.workspaceStreams.delete(typedWorkspaceId);
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to start stream: ${message}`);
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

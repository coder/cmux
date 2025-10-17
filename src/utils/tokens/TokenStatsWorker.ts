/**
 * Wrapper class for managing the token statistics Web Worker
 * Provides a clean async API for calculating stats off the main thread
 */

import assert from "@/utils/assert";
import type { CmuxMessage } from "@/types/message";
import type { ChatStats } from "@/types/chatStats";
import type {
  WorkerRequest,
  WorkerResponse,
  WorkerError,
  WorkerNotification,
} from "./tokenStats.worker";

type WorkerMessage = WorkerResponse | WorkerError | WorkerNotification;

/**
 * TokenStatsWorker manages a dedicated Web Worker for calculating token statistics
 * Ensures only one calculation runs at a time and provides Promise-based API
 */
export class TokenStatsWorker {
  private readonly worker: Worker;
  private requestCounter = 0;
  private pendingRequest: {
    id: string;
    resolve: (stats: ChatStats) => void;
    reject: (error: Error) => void;
  } | null = null;
  private readonly tokenizerReadyListeners = new Set<() => void>();
  private readonly encodingListeners = new Set<(encodingName: string) => void>();
  private tokenizerReady = false;
  private readonly loadedEncodings = new Set<string>();

  constructor() {
    // Create worker using Vite's Web Worker support
    // The ?worker suffix tells Vite to bundle this as a worker
    this.worker = new Worker(new URL("./tokenStats.worker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);
  }

  onTokenizerReady(listener: () => void): () => void {
    assert(typeof listener === "function", "Tokenizer ready listener must be a function");
    this.tokenizerReadyListeners.add(listener);
    if (this.tokenizerReady) {
      try {
        listener();
      } catch (error) {
        console.error("[TokenStatsWorker] Tokenizer ready listener threw", error);
      }
    }
    return () => {
      this.tokenizerReadyListeners.delete(listener);
    };
  }

  onEncodingLoaded(listener: (encodingName: string) => void): () => void {
    assert(typeof listener === "function", "Tokenizer encoding listener must be a function");
    this.encodingListeners.add(listener);
    if (this.loadedEncodings.size > 0) {
      for (const encodingName of this.loadedEncodings) {
        try {
          listener(encodingName);
        } catch (error) {
          console.error(
            `[TokenStatsWorker] Tokenizer encoding listener threw for '${encodingName}' during replay`,
            error
          );
        }
      }
    }
    return () => {
      this.encodingListeners.delete(listener);
    };
  }

  /**
   * Calculate token statistics for the given messages
   * Cancels any pending calculation and starts a new one
   * @param messages - Array of CmuxMessages to analyze
   * @param model - Model string for tokenizer selection
   * @returns Promise that resolves with calculated stats
   */
  calculate(messages: CmuxMessage[], model: string): Promise<ChatStats> {
    // Cancel any pending request (latest request wins)
    if (this.pendingRequest) {
      this.pendingRequest.reject(new Error("Cancelled by newer request"));
      this.pendingRequest = null;
    }

    // Generate unique request ID
    const id = `${Date.now()}-${++this.requestCounter}`;

    // Create promise that will resolve when worker responds
    const promise = new Promise<ChatStats>((resolve, reject) => {
      this.pendingRequest = { id, resolve, reject };
    });

    // Send calculation request to worker
    const request: WorkerRequest = {
      id,
      messages,
      model,
    };
    this.worker.postMessage(request);

    return promise;
  }

  /**
   * Handle successful or error responses from worker
   */
  private handleMessage(e: MessageEvent<WorkerMessage>) {
    const response = e.data;

    if ("type" in response) {
      if (response.type === "tokenizer-ready") {
        this.notifyTokenizerReady();
        return;
      }
      if (response.type === "encoding-loaded") {
        this.notifyEncodingLoaded(response.encodingName);
        return;
      }
      assert(false, "Received unknown worker notification type");
      return;
    }

    // Ignore responses for cancelled requests
    if (!this.pendingRequest || this.pendingRequest.id !== response.id) {
      return;
    }

    const { resolve, reject } = this.pendingRequest;
    this.pendingRequest = null;

    if (response.success) {
      resolve(response.stats);
    } else {
      reject(new Error(response.error));
    }
  }

  /**
   * Handle worker errors (script errors, not calculation errors)
   */
  private handleError(error: ErrorEvent) {
    if (this.pendingRequest) {
      this.pendingRequest.reject(new Error(`Worker error: ${error.message || "Unknown error"}`));
      this.pendingRequest = null;
    }
  }

  /**
   * Terminate the worker and clean up resources
   */
  terminate() {
    if (this.pendingRequest) {
      this.pendingRequest.reject(new Error("Worker terminated"));
      this.pendingRequest = null;
    }
    this.worker.terminate();
    this.tokenizerReadyListeners.clear();
    this.encodingListeners.clear();
    this.loadedEncodings.clear();
    this.tokenizerReady = false;
  }

  private notifyTokenizerReady(): void {
    this.tokenizerReady = true;
    if (this.tokenizerReadyListeners.size === 0) {
      return;
    }
    for (const listener of this.tokenizerReadyListeners) {
      try {
        listener();
      } catch (error) {
        console.error("[TokenStatsWorker] Tokenizer ready listener threw", error);
      }
    }
  }

  private notifyEncodingLoaded(encodingName: string): void {
    assert(
      typeof encodingName === "string" && encodingName.length > 0,
      "Tokenizer encoding notifications require a non-empty encoding name"
    );
    this.loadedEncodings.add(encodingName);
    if (this.encodingListeners.size === 0) {
      return;
    }
    for (const listener of this.encodingListeners) {
      try {
        listener(encodingName);
      } catch (error) {
        console.error(
          `[TokenStatsWorker] Tokenizer encoding listener threw for '${encodingName}'`,
          error
        );
      }
    }
  }
}

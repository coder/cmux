/**
 * Tokenizer Worker Pool
 * Manages Node.js worker thread for off-main-thread tokenization
 */

import { Worker } from "worker_threads";
import path from "path";
import { log } from "@/services/log";

interface PendingRequest {
  resolve: (counts: number[]) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

interface TokenizeRequest {
  requestId: number;
  model: string;
  texts: string[];
}

interface TokenizeResponse {
  requestId: number;
  success: boolean;
  counts?: number[];
  error?: string;
}

class TokenizerWorkerPool {
  private worker: Worker | null = null;
  private requestCounter = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private isTerminating = false;

  /**
   * Get or create the worker thread
   */
  private getWorker(): Worker {
    if (this.worker && !this.isTerminating) {
      return this.worker;
    }

    // Worker script path - compiled by tsc to dist/src/workers/tokenizerWorker.js
    // __dirname in production will be dist/src/services, so we go up one level then into workers
    const workerPath = path.join(__dirname, "..", "workers", "tokenizerWorker.js");

    this.worker = new Worker(workerPath);
    this.isTerminating = false;

    this.worker.on("message", (response: TokenizeResponse) => {
      this.handleResponse(response);
    });

    this.worker.on("error", (error: Error) => {
      log.error("Tokenizer worker error:", error);
      // Reject all pending requests
      for (const [requestId, pending] of this.pendingRequests) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error(`Worker error: ${error.message}`));
        this.pendingRequests.delete(requestId);
      }
    });

    this.worker.on("exit", (code: number) => {
      if (!this.isTerminating && code !== 0) {
        log.error(`Tokenizer worker exited with code ${code}`);
      }
      this.worker = null;
    });

    return this.worker;
  }

  /**
   * Handle response from worker
   */
  private handleResponse(response: TokenizeResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      return; // Request was cancelled or timed out
    }

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(response.requestId);

    if (response.success && response.counts) {
      pending.resolve(response.counts);
    } else {
      pending.reject(new Error(response.error ?? "Unknown worker error"));
    }
  }

  /**
   * Count tokens for multiple texts using worker thread
   * @param model - Model identifier for tokenizer selection
   * @param texts - Array of texts to tokenize
   * @returns Promise resolving to array of token counts
   */
  async countTokens(model: string, texts: string[]): Promise<number[]> {
    const requestId = this.requestCounter++;
    const worker = this.getWorker();

    return new Promise<number[]>((resolve, reject) => {
      // Set timeout for request (30 seconds)
      const timeoutId = setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          reject(new Error("Tokenization request timeout (30s)"));
        }
      }, 30000);

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      // Send request to worker
      const request: TokenizeRequest = {
        requestId,
        model,
        texts,
      };

      try {
        worker.postMessage(request);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Terminate the worker thread and reject all pending requests
   */
  terminate(): void {
    this.isTerminating = true;

    // Reject all pending requests
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Worker pool terminated"));
      this.pendingRequests.delete(requestId);
    }

    // Terminate worker
    if (this.worker) {
      this.worker.terminate().catch((error) => {
        log.error("Error terminating tokenizer worker:", error);
      });
      this.worker = null;
    }
  }
}

// Singleton instance
export const tokenizerWorkerPool = new TokenizerWorkerPool();

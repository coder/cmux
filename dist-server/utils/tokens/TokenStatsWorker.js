"use strict";
/**
 * Wrapper class for managing the token statistics Web Worker
 * Provides a clean async API for calculating stats off the main thread
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenStatsWorker = void 0;
/**
 * TokenStatsWorker manages a dedicated Web Worker for calculating token statistics
 * Ensures only one calculation runs at a time and provides Promise-based API
 */
class TokenStatsWorker {
    worker;
    requestCounter = 0;
    pendingRequest = null;
    constructor() {
        // Create worker using Vite's Web Worker support
        // The ?worker suffix tells Vite to bundle this as a worker
        this.worker = new Worker(new URL("./tokenStats.worker.ts", import.meta.url), {
            type: "module",
        });
        this.worker.onmessage = this.handleMessage.bind(this);
        this.worker.onerror = this.handleError.bind(this);
    }
    /**
     * Calculate token statistics for the given messages
     * Cancels any pending calculation and starts a new one
     * @param messages - Array of CmuxMessages to analyze
     * @param model - Model string for tokenizer selection
     * @returns Promise that resolves with calculated stats
     */
    calculate(messages, model) {
        // Cancel any pending request (latest request wins)
        if (this.pendingRequest) {
            this.pendingRequest.reject(new Error("Cancelled by newer request"));
            this.pendingRequest = null;
        }
        // Generate unique request ID
        const id = `${Date.now()}-${++this.requestCounter}`;
        // Create promise that will resolve when worker responds
        const promise = new Promise((resolve, reject) => {
            this.pendingRequest = { id, resolve, reject };
        });
        // Send calculation request to worker
        const request = {
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
    handleMessage(e) {
        const response = e.data;
        // Ignore responses for cancelled requests
        if (!this.pendingRequest || this.pendingRequest.id !== response.id) {
            return;
        }
        const { resolve, reject } = this.pendingRequest;
        this.pendingRequest = null;
        if (response.success) {
            resolve(response.stats);
        }
        else {
            reject(new Error(response.error));
        }
    }
    /**
     * Handle worker errors (script errors, not calculation errors)
     */
    handleError(error) {
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
    }
}
exports.TokenStatsWorker = TokenStatsWorker;
//# sourceMappingURL=TokenStatsWorker.js.map
/**
 * StreamingTokenTracker - Incremental token counting for streaming responses
 *
 * Tracks tokens across text, reasoning, and tool arguments with:
 * - Batched tokenization (every 100ms or 400 chars) for performance
 * - Smoothed TPS calculation using circular buffer
 * - Leverages existing ai-tokenizer with LRU caching
 */

import { getTokenizerForModel, type Tokenizer } from "./tokenizer";

/**
 * Token tracking state for a single streaming message
 */
interface StreamingTokenState {
  textTokens: number; // Tokenized text tokens
  reasoningTokens: number; // Tokenized reasoning tokens
  toolArgsTokens: number; // Tokenized tool argument tokens
  lastUpdate: number; // Timestamp of last tokenization
  lastTokenCount: number; // Token count at last TPS calculation
  lastTpsUpdate: number; // Timestamp of last TPS calculation
  tpsSamples: number[]; // Circular buffer of recent TPS samples for smoothing
  tpsSampleIndex: number; // Current index in circular buffer
  accumulatedText: string; // Buffer for batching text deltas
  accumulatedReasoning: string; // Buffer for batching reasoning deltas
  accumulatedToolArgs: string; // Buffer for batching tool arg deltas
}

// Throttle parameters for tokenization
const TOKENIZE_INTERVAL_MS = 100; // Tokenize every 100ms
const TOKENIZE_CHAR_THRESHOLD = 400; // Or when 400 chars (~100 tokens) accumulated
const TPS_SAMPLE_COUNT = 5; // Number of TPS samples to average for smoothing

/**
 * StreamingTokenTracker manages token counting for streaming messages
 * Provides real-time token counts and TPS rates with minimal overhead
 */
export class StreamingTokenTracker {
  private tokenState = new Map<string, StreamingTokenState>();
  private tokenizer: Tokenizer | null = null;

  /**
   * Initialize tokenizer for the current model
   * Should be called when model changes or on first stream
   */
  setModel(model: string): void {
    if (!this.tokenizer || this.tokenizer.name === "approximation") {
      this.tokenizer = getTokenizerForModel(model);
    }
  }

  /**
   * Get or create token state for a streaming message
   */
  private getOrCreateTokenState(messageId: string): StreamingTokenState {
    let state = this.tokenState.get(messageId);
    if (!state) {
      state = {
        textTokens: 0,
        reasoningTokens: 0,
        toolArgsTokens: 0,
        lastUpdate: Date.now(),
        lastTokenCount: 0,
        lastTpsUpdate: Date.now(),
        tpsSamples: new Array(TPS_SAMPLE_COUNT).fill(0) as number[],
        tpsSampleIndex: 0,
        accumulatedText: "",
        accumulatedReasoning: "",
        accumulatedToolArgs: "",
      };
      this.tokenState.set(messageId, state);
    }
    return state;
  }

  /**
   * Track token deltas for live counting and TPS calculation
   * Accumulates deltas and triggers tokenization when threshold is met
   */
  trackDelta(messageId: string, delta: string, type: "text" | "reasoning" | "tool-args"): void {
    const state = this.getOrCreateTokenState(messageId);

    // Accumulate delta
    switch (type) {
      case "text":
        state.accumulatedText += delta;
        break;
      case "reasoning":
        state.accumulatedReasoning += delta;
        break;
      case "tool-args":
        state.accumulatedToolArgs += delta;
        break;
    }

    // Throttle: only tokenize if enough time/chars accumulated
    const now = Date.now();
    const totalChars =
      state.accumulatedText.length +
      state.accumulatedReasoning.length +
      state.accumulatedToolArgs.length;

    if (now - state.lastUpdate > TOKENIZE_INTERVAL_MS || totalChars > TOKENIZE_CHAR_THRESHOLD) {
      this.tokenizeAccumulated(messageId);
      state.lastUpdate = now;
    }
  }

  /**
   * Tokenize accumulated buffers and update token counts
   */
  private tokenizeAccumulated(messageId: string): void {
    if (!this.tokenizer) return;
    const state = this.tokenState.get(messageId);
    if (!state) return;

    // Tokenize each accumulated buffer if non-empty
    if (state.accumulatedText) {
      state.textTokens += this.tokenizer.countTokens(state.accumulatedText);
      state.accumulatedText = "";
    }
    if (state.accumulatedReasoning) {
      state.reasoningTokens += this.tokenizer.countTokens(state.accumulatedReasoning);
      state.accumulatedReasoning = "";
    }
    if (state.accumulatedToolArgs) {
      state.toolArgsTokens += this.tokenizer.countTokens(state.accumulatedToolArgs);
      state.accumulatedToolArgs = "";
    }

    // Update TPS calculation
    const now = Date.now();
    const newTotal = state.textTokens + state.reasoningTokens + state.toolArgsTokens;
    const tokensDelta = newTotal - state.lastTokenCount;
    const timeDelta = (now - state.lastTpsUpdate) / 1000; // Convert to seconds

    if (timeDelta > 0) {
      // Calculate TPS (0 if no new tokens)
      const currentTps = tokensDelta > 0 ? tokensDelta / timeDelta : 0;

      // Add to circular buffer for smoothing (includes zeros)
      state.tpsSamples[state.tpsSampleIndex] = currentTps;
      state.tpsSampleIndex = (state.tpsSampleIndex + 1) % TPS_SAMPLE_COUNT;

      state.lastTokenCount = newTotal;
      state.lastTpsUpdate = now;
    }
  }

  /**
   * Finalize streaming tokens by tokenizing any remaining buffered content
   */
  finalize(messageId: string): void {
    this.tokenizeAccumulated(messageId);
  }

  /**
   * Get current token count estimate (includes buffered chars as approximation)
   */
  getTokenCount(messageId: string): number {
    const state = this.tokenState.get(messageId);
    if (!state) return 0;

    // Actual tokens + estimate for buffered content
    const bufferedChars =
      state.accumulatedText.length +
      state.accumulatedReasoning.length +
      state.accumulatedToolArgs.length;
    const bufferedEstimate = Math.ceil(bufferedChars / 4);

    return state.textTokens + state.reasoningTokens + state.toolArgsTokens + bufferedEstimate;
  }

  /**
   * Get smoothed tokens per second rate for a streaming message
   * Returns 0 when no tokens are being generated (e.g., reasoning, tool execution)
   */
  getTPS(messageId: string): number {
    const state = this.tokenState.get(messageId);
    if (!state) return 0;

    // Calculate average TPS from all samples (including zeros)
    // This allows TPS to drop to 0 when streaming pauses
    const avgTps = state.tpsSamples.reduce((sum, sample) => sum + sample, 0) / TPS_SAMPLE_COUNT;
    return Math.round(avgTps); // Round to whole number
  }

  /**
   * Clear token state for a message (call on stream end/abort)
   */
  clear(messageId: string): void {
    this.tokenState.delete(messageId);
  }

  /**
   * Clear all token state (useful for testing)
   */
  clearAll(): void {
    this.tokenState.clear();
  }
}

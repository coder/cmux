/**
 * StreamingTokenTracker - Synchronous token counting for streaming deltas
 *
 * Simplified tracker that provides immediate token counts for each delta.
 * TPS calculation moved to frontend for better replay support and flexibility.
 */

import { getTokenizerForModel, type Tokenizer } from "./tokenizer";

/**
 * StreamingTokenTracker provides synchronous token counting
 */
export class StreamingTokenTracker {
  private tokenizer: Tokenizer | null = null;
  private currentModel: string | null = null;

  /**
   * Initialize tokenizer for the current model
   * Should be called when model changes or on first stream
   *
   * IMPORTANT: Reinitializes tokenizer when model changes to ensure correct encoding.
   * getTokenizerForModel() closes over the model string, so we must create a new
   * tokenizer instance when switching models.
   */
  setModel(model: string): void {
    // Reinitialize if model changed or not yet initialized
    if (this.currentModel !== model) {
      this.currentModel = model;
      this.tokenizer = getTokenizerForModel(model);
    }
  }

  /**
   * Count tokens in a text string synchronously
   * Performance: <1ms per delta with LRU caching
   */
  countTokens(text: string): number {
    if (!this.tokenizer || !text) return 0;
    return this.tokenizer.countTokens(text);
  }
}

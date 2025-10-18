/**
 * Node.js Worker Thread for tokenization
 * Offloads CPU-intensive tokenization to prevent main process blocking
 */

import { parentPort } from "worker_threads";

// Lazy-load tokenizer only when first needed
let getTokenizerForModel: ((model: string) => { countTokens: (text: string) => number }) | null =
  null;

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

parentPort?.on("message", (data: TokenizeRequest) => {
  const { requestId, model, texts } = data;

  void (async () => {
    try {
      // Lazy-load tokenizer on first use
      // Dynamic import is acceptable here as worker is isolated and has no circular deps
      if (!getTokenizerForModel) {
        /* eslint-disable-next-line no-restricted-syntax */
        const tokenizerModule = await import("@/utils/main/tokenizer");
        getTokenizerForModel = tokenizerModule.getTokenizerForModel;
      }

      const tokenizer = getTokenizerForModel(model);
      const counts = texts.map((text) => tokenizer.countTokens(text));

      const response: TokenizeResponse = {
        requestId,
        success: true,
        counts,
      };
      parentPort?.postMessage(response);
    } catch (error) {
      const response: TokenizeResponse = {
        requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      parentPort?.postMessage(response);
    }
  })();
});

/**
 * Web Worker for calculating token statistics off the main thread
 * This prevents UI blocking during expensive tokenization operations
 */

import type { CmuxMessage } from "@/types/message";
import type { ChatStats } from "@/types/chatStats";
import { onTokenizerEncodingLoaded, onTokenizerModulesLoaded } from "@/utils/main/tokenizer";
import { calculateTokenStats } from "./tokenStatsCalculator";

export interface WorkerRequest {
  id: string;
  messages: CmuxMessage[];
  model: string;
}

export interface WorkerResponse {
  id: string;
  success: true;
  stats: ChatStats;
}

export interface WorkerError {
  id: string;
  success: false;
  error: string;
}

export type WorkerNotification =
  | { type: "tokenizer-ready" }
  | { type: "encoding-loaded"; encodingName: string };

// Handle incoming calculation requests
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, messages, model } = e.data;

  try {
    const stats = calculateTokenStats(messages, model);
    const response: WorkerResponse = {
      id,
      success: true,
      stats,
    };
    self.postMessage(response);
  } catch (error) {
    const errorResponse: WorkerError = {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(errorResponse);
  }
};

onTokenizerModulesLoaded(() => {
  const notification: WorkerNotification = { type: "tokenizer-ready" };
  self.postMessage(notification);
});

onTokenizerEncodingLoaded((encodingName) => {
  if (typeof encodingName !== "string" || encodingName.length === 0) {
    throw new Error("Worker received invalid tokenizer encoding name");
  }
  const notification: WorkerNotification = {
    type: "encoding-loaded",
    encodingName,
  };
  self.postMessage(notification);
});

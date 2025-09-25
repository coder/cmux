export interface UIMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'result';
  content: string;
  contentDeltas?: string[];  // Raw delta array for streaming messages
  isStreaming?: boolean;
  isBreadcrumb?: boolean;
  metadata?: {
    originalSDKMessage?: any;
    streamingId?: string;
    cost?: number;
    tokens?: number;
    duration?: number;
  };
  sequenceNumber: number;
  timestamp: number;
}

export interface StreamingContext {
  streamingId: string;
  messageId: string;
  contentParts: string[];
  startTime: number;
  isComplete: boolean;
}
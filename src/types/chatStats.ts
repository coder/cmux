export interface TokenConsumer {
  name: string; // "User", "Assistant", "bash", "readFile", etc.
  tokens: number; // Token count for this consumer
  percentage: number; // % of total tokens
}

export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatStats {
  consumers: TokenConsumer[]; // Sorted descending by token count
  totalTokens: number;
  model: string;
  tokenizerName: string; // e.g., "Anthropic Claude", "OpenAI GPT-4"
  lastUsage?: UsageStats; // Last actual usage statistics from API
}

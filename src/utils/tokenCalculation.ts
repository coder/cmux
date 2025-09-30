/**
 * Token calculation utilities for chat statistics
 */

export interface Tokenizer {
  name: string;
  countTokens: (text: string) => Promise<number>;
}

/**
 * Get the appropriate tokenizer for a given model string
 *
 * @param modelString - Model identifier (e.g., "anthropic:claude-opus-4-1", "openai:gpt-4")
 * @returns Tokenizer interface with name and countTokens function
 */
export function getTokenizerForModel(modelString: string): Tokenizer {
  const provider = modelString.split(":")[0]?.toLowerCase();

  switch (provider) {
    case "anthropic":
      return {
        name: "Anthropic Claude Tokenizer",
        countTokens: async (text: string) => {
          // TODO: Integrate @anthropic-ai/sdk countTokens()
          // For now, rough approximation: ~4 chars per token
          return Math.ceil(text.length / 4);
        },
      };

    case "openai":
      return {
        name: "OpenAI Tokenizer",
        countTokens: async (text: string) => {
          // TODO: Integrate tiktoken for OpenAI models
          // For now, rough approximation: ~4 chars per token
          return Math.ceil(text.length / 4);
        },
      };

    case "google":
      return {
        name: "Google Gemini Tokenizer",
        countTokens: async (text: string) => {
          // TODO: Integrate Google tokenizer
          // For now, rough approximation: ~4 chars per token
          return Math.ceil(text.length / 4);
        },
      };

    default:
      // Default to Anthropic tokenizer for unknown models
      console.warn(`Unknown model provider "${provider}", defaulting to Anthropic tokenizer`);
      return {
        name: "Anthropic Claude Tokenizer (default)",
        countTokens: async (text: string) => {
          // TODO: Integrate @anthropic-ai/sdk countTokens()
          // For now, rough approximation: ~4 chars per token
          return Math.ceil(text.length / 4);
        },
      };
  }
}

/**
 * Calculate token counts for serialized data (tool args/results)
 */
export async function countTokensForData(data: unknown, tokenizer: Tokenizer): Promise<number> {
  const serialized = JSON.stringify(data);
  return tokenizer.countTokens(serialized);
}

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

/**
 * Get estimated token count for tool definitions
 * These are the schemas sent to the API for each tool
 *
 * @param toolName The name of the tool (bash, read_file, web_search, etc.)
 * @param modelString The model string to get accurate tool definitions
 * @returns Promise<number> Estimated token count for the tool definition
 */
export async function getToolDefinitionTokens(
  toolName: string,
  modelString: string
): Promise<number> {
  // Import the frontend-safe tool definitions
  const { getToolSchemas, getAvailableTools } = await import("./toolDefinitions");

  try {
    // Check if this tool is available for this model
    const availableTools = getAvailableTools(modelString);
    if (!availableTools.includes(toolName)) {
      // Tool not available for this model
      return 0;
    }

    // Get the tool schema
    const toolSchemas = getToolSchemas();
    const toolSchema = toolSchemas[toolName];

    if (!toolSchema) {
      // Tool not found, return a default estimate
      return 40;
    }

    // Serialize the tool definition to estimate tokens
    const serialized = JSON.stringify(toolSchema);
    const tokenizer = getTokenizerForModel(modelString);
    return tokenizer.countTokens(serialized);
  } catch {
    // Fallback to estimates if we can't get the actual definition
    const fallbackSizes: Record<string, number> = {
      bash: 65,
      read_file: 45,
      web_search: 50,
      google_search: 50,
    };
    return fallbackSizes[toolName] || 40;
  }
}

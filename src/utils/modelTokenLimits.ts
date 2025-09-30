/**
 * Get the maximum token limit for a given model
 * Returns the total context window size (input + output tokens)
 *
 * @param modelString - Model identifier (e.g., "anthropic:claude-opus-4-1")
 * @returns Maximum token limit for the model, or undefined if unknown
 */
export function getMaxTokensForModel(modelString: string): number | undefined {
  // Normalize the model string to lowercase for matching
  const normalizedModel = modelString.toLowerCase();

  // Anthropic models
  if (normalizedModel.includes("anthropic:")) {
    if (normalizedModel.includes("opus")) {
      return 200000; // Claude Opus models have 200k context window
    }
    if (normalizedModel.includes("sonnet")) {
      return 200000; // Claude Sonnet models also have 200k context window
    }
    if (normalizedModel.includes("haiku")) {
      return 200000; // Claude Haiku models have 200k context window
    }
  }

  // OpenAI models
  if (normalizedModel.includes("openai:")) {
    if (normalizedModel.includes("gpt-4-turbo") || normalizedModel.includes("gpt-4-1106")) {
      return 128000; // GPT-4 Turbo has 128k context window
    }
    if (normalizedModel.includes("gpt-4o")) {
      return 128000; // GPT-4o has 128k context window
    }
    if (normalizedModel.includes("gpt-4")) {
      return 8192; // Standard GPT-4 has 8k context window
    }
    if (normalizedModel.includes("gpt-3.5-turbo")) {
      return 16385; // GPT-3.5 Turbo has 16k context window
    }
  }

  // Google models
  if (normalizedModel.includes("google:") || normalizedModel.includes("gemini")) {
    if (normalizedModel.includes("gemini-1.5-pro")) {
      return 2097152; // Gemini 1.5 Pro supports up to 2M tokens
    }
    if (normalizedModel.includes("gemini-1.5-flash")) {
      return 1048576; // Gemini 1.5 Flash supports up to 1M tokens
    }
  }

  // Return undefined for unknown models
  return undefined;
}

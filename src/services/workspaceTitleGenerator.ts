import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import type { Config } from "@/config";
import { log } from "./log";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

const workspaceNamesSchema = z.object({
  title: z
    .string()
    .min(10)
    .max(80)
    .describe("Human-readable workspace title with proper capitalization and spaces"),
  branchName: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(3)
    .max(50)
    .describe("Git-safe branch name: lowercase, hyphens only"),
});

/**
 * Generate workspace title and branch name using AI
 * Falls back to timestamp-based names if AI generation fails
 * @param message - The user's first message
 * @param modelString - Model string from send message options (e.g., "anthropic:claude-3-5-sonnet-20241022")
 * @param config - Config instance for provider access
 */
export async function generateWorkspaceNames(
  message: string,
  modelString: string,
  config: Config
): Promise<{ title: string; branchName: string }> {
  try {
    const model = getModelForTitleGeneration(modelString, config);

    if (!model) {
      // No providers available, use fallback immediately
      return createFallbackNames();
    }

    const result = await generateObject({
      model,
      schema: workspaceNamesSchema,
      prompt: `Generate a workspace title and git branch name for this development task:

"${message}"

Requirements:
- title: Clear, readable description (e.g., "Implementing automatic chat title generation")
- branchName: Git-safe identifier (e.g., "automatic-title-generation")

Both should be concise (2-5 words) and descriptive of the task.`,
    });

    return {
      title: result.object.title,
      branchName: validateBranchName(result.object.branchName),
    };
  } catch (error) {
    log.error("Failed to generate workspace names with AI, using fallback", error);
    return createFallbackNames();
  }
}

/**
 * Get model for title generation using the same model as the message
 * Falls back to null if provider not configured
 */
function getModelForTitleGeneration(modelString: string, config: Config): LanguageModel | null {
  const providersConfig = config.loadProvidersConfig();

  if (!providersConfig) {
    return null;
  }

  // Parse model string (e.g., "anthropic:claude-3-5-sonnet-20241022")
  const [providerName, modelId] = modelString.split(":", 2);

  if (!providerName || !modelId) {
    log.error("Invalid model string format:", modelString);
    return null;
  }

  try {
    if (providerName === "anthropic" && providersConfig.anthropic?.apiKey) {
      const provider = createAnthropic({
        apiKey: String(providersConfig.anthropic.apiKey),
      });
      return provider(modelId);
    }

    if (providerName === "openai" && providersConfig.openai?.apiKey) {
      const provider = createOpenAI({
        apiKey: String(providersConfig.openai.apiKey),
      });
      return provider(modelId);
    }

    log.error(`Provider ${providerName} not configured or not supported`);
    return null;
  } catch (error) {
    log.error(`Failed to create model for title generation: ${modelString}`, error);
    return null;
  }
}

/**
 * Create fallback names using timestamp
 */
function createFallbackNames(): { title: string; branchName: string } {
  const timestamp = Date.now().toString(36);
  return {
    title: `Chat ${timestamp}`,
    branchName: `chat-${timestamp}`,
  };
}

/**
 * Validate and sanitize branch name to be git-safe
 */
function validateBranchName(name: string): string {
  // Ensure git-safe
  const cleaned = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  // Remove leading/trailing hyphens and collapse multiple hyphens
  return cleaned
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .substring(0, 50);
}

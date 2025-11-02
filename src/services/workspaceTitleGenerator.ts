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
 */
export async function generateWorkspaceNames(
  message: string,
  config: Config
): Promise<{ title: string; branchName: string }> {
  try {
    const model = selectCheapModel(config);

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
 * Select a cheap model for title generation
 * Prefers Haiku > GPT-4o-mini > Gemini Flash > null
 */
function selectCheapModel(config: Config): LanguageModel | null {
  const providersConfig = config.loadProvidersConfig();

  if (!providersConfig) {
    return null;
  }

  // Prefer Anthropic Claude Haiku (fastest + cheapest)
  if (providersConfig.anthropic?.apiKey) {
    try {
      const provider = createAnthropic({
        apiKey: String(providersConfig.anthropic.apiKey),
      });
      return provider("claude-3-5-haiku-20241022");
    } catch (error) {
      log.error("Failed to create Anthropic provider for title generation", error);
    }
  }

  // Fall back to OpenAI GPT-4o-mini
  if (providersConfig.openai?.apiKey) {
    try {
      const provider = createOpenAI({
        apiKey: String(providersConfig.openai.apiKey),
      });
      return provider("gpt-4o-mini");
    } catch (error) {
      log.error("Failed to create OpenAI provider for title generation", error);
    }
  }

  return null;
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

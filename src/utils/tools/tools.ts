import { type Tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createFileReadTool } from "@/services/tools/file_read";
import { createBashTool } from "@/services/tools/bash";
import { createFileEditReplaceStringTool } from "@/services/tools/file_edit_replace_string";
import { createFileEditReplaceLinesTool } from "@/services/tools/file_edit_replace_lines";
import { createFileEditInsertTool } from "@/services/tools/file_edit_insert";
import { createProposePlanTool } from "@/services/tools/propose_plan";
import { createCompactSummaryTool } from "@/services/tools/compact_summary";
import { log } from "@/services/log";

/**
 * Configuration for tools that need runtime context
 */
export interface ToolConfiguration {
  /** Working directory for command execution (required) */
  cwd: string;
  /** Environment secrets to inject (optional) */
  secrets?: Record<string, string>;
  /** Process niceness level (optional, -20 to 19, lower = higher priority) */
  niceness?: number;
}

/**
 * Factory function interface for creating tools with configuration
 */
export type ToolFactory = (config: ToolConfiguration) => Tool;

/**
 * Get tools available for a specific model with configuration
 * @param modelString The model string in format "provider:model-id"
 * @param config Required configuration for tools
 * @returns Record of tools available for the model
 */
export function getToolsForModel(
  modelString: string,
  config: ToolConfiguration
): Record<string, Tool> {
  const [provider, modelId] = modelString.split(":");

  // Base tools available for all models
  const baseTools: Record<string, Tool> = {
    // Use snake_case for tool names to match what seems to be the convention.
    file_read: createFileReadTool(config),
    file_edit_replace_string: createFileEditReplaceStringTool(config),
    file_edit_replace_lines: createFileEditReplaceLinesTool(config),
    file_edit_insert: createFileEditInsertTool(config),
    bash: createBashTool(config),
    propose_plan: createProposePlanTool(config),
    compact_summary: createCompactSummaryTool(config),
  };

  // Try to add provider-specific web search tools if available
  // This doesn't break if the provider isn't recognized
  try {
    switch (provider) {
      case "anthropic":
        return {
          ...baseTools,
          web_search: anthropic.tools.webSearch_20250305({ maxUses: 1000 }),
        };

      case "openai":
        // Only add web search for models that support it
        if (modelId.includes("gpt-5") || modelId.includes("gpt-4")) {
          return {
            ...baseTools,
            web_search: openai.tools.webSearch({
              searchContextSize: "high",
            }),
          };
        }
        break;

      case "google":
        return {
          ...baseTools,
          google_search: google.tools.googleSearch({}),
        };
    }
  } catch (error) {
    // If tools aren't available, just return base tools
    log.error(`No web search tools available for ${provider}:`, error);
  }

  return baseTools;
}

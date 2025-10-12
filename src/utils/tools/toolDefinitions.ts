/**
 * Tool definitions module - Frontend-safe
 *
 * Single source of truth for all tool definitions.
 * Zod schemas are defined here and JSON schemas are auto-generated.
 */

import { z } from "zod";
import {
  BASH_DEFAULT_TIMEOUT_SECS,
  BASH_HARD_MAX_LINES,
  BASH_MAX_LINE_BYTES,
  BASH_MAX_TOTAL_BYTES,
} from "@/constants/toolLimits";

import { zodToJsonSchema } from "zod-to-json-schema";

interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * Tool definitions: single source of truth
 * Key = tool name, Value = { description, schema }
 */
export const TOOL_DEFINITIONS = {
  bash: {
    description:
      "Execute a bash command with a configurable timeout. " +
      `Output is strictly limited to ${BASH_HARD_MAX_LINES} lines, ${BASH_MAX_LINE_BYTES} bytes per line, and ${BASH_MAX_TOTAL_BYTES} bytes total. ` +
      "Commands that exceed these limits will FAIL with an error (no partial output returned). " +
      "Be conservative: use 'head', 'tail', 'grep', or other filters to limit output before running commands.",
    schema: z.object({
      script: z.string().describe("The bash script/command to execute"),
      timeout_secs: z
        .number()
        .positive()
        .optional()
        .describe(
          `Timeout (seconds, default: ${BASH_DEFAULT_TIMEOUT_SECS}). Start small and increase on retry; avoid large initial values to keep UX responsive`
        ),
    }),
  },
  file_read: {
    description:
      "Read the contents of a file from the file system. Read as little as possible to complete the task.",
    schema: z.object({
      filePath: z.string().describe("The path to the file to read (absolute or relative)"),
      offset: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("1-based starting line number (optional, defaults to 1)"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of lines to return from offset (optional, returns all if not specified)"),
    }),
  },
  file_edit_replace: {
    description:
      "Replace content in a file using either exact string matching or line ranges. Choose mode='string' for text replacements or mode='lines' for line-range updates.",
    schema: z.discriminatedUnion("mode", [
      z.object({
        mode: z.literal("string"),
        file_path: z.string().describe("The absolute path to the file to edit"),
        old_string: z
          .string()
          .describe(
            "The exact text to replace. Include enough context (indentation, surrounding lines) to make it unique."
          ),
        new_string: z.string().describe("The replacement text"),
        replace_count: z
          .number()
          .int()
          .optional()
          .describe(
            "Number of occurrences to replace (default: 1). Use -1 to replace all occurrences. If 1, old_string must be unique in the file."
          ),
      }),
      z.object({
        mode: z.literal("lines"),
        file_path: z.string().describe("The absolute path to the file to edit"),
        start_line: z.number().int().min(1).describe("1-indexed start line (inclusive) to replace"),
        end_line: z.number().int().min(1).describe("1-indexed end line (inclusive) to replace"),
        new_lines: z
          .array(z.string())
          .describe("Replacement lines. Provide an empty array to delete the specified range."),
        expected_lines: z
          .array(z.string())
          .optional()
          .describe(
            "Optional safety check. When provided, the current lines in the specified range must match exactly."
          ),
      }),
    ]),
  },
  file_edit_insert: {
    description:
      "Insert content at a specific line position in a file. Line offset is 1-indexed: 0 inserts at the top, 1 inserts after line 1, etc.",
    schema: z.object({
      file_path: z.string().describe("The absolute path to the file to edit"),
      line_offset: z
        .number()
        .int()
        .min(0)
        .describe("1-indexed line position (0 = insert at top, N = insert after line N)"),
      content: z.string().describe("The content to insert"),
      create: z
        .boolean()
        .optional()
        .describe("If true, create the file if it doesn't exist (default: false)"),
    }),
  },
  propose_plan: {
    description:
      "Propose a plan before taking action. The plan should be complete but minimal - cover what needs to be decided or understood, nothing more. Use this tool to get approval before proceeding with implementation.",
    schema: z.object({
      title: z
        .string()
        .describe("A short, descriptive title for the plan (e.g., 'Add User Authentication')"),
      plan: z
        .string()
        .describe(
          "Implementation plan in markdown (start at h2 level). " +
            "Scale the detail to match the task complexity: for straightforward changes, briefly state what and why; " +
            "for complex changes, explain approach, key decisions, risks/tradeoffs; " +
            "for uncertain changes, clarify options and what needs user input. " +
            "When presenting options, always provide your recommendation for the overall best option for the user. " +
            "For highly complex concepts, use mermaid diagrams where they'd clarify better than text. " +
            "Cover what's necessary to understand and approve the approach. Omit obvious details or ceremony."
        ),
    }),
  },
  compact_summary: {
    description:
      "Summarize the conversation history into a compact form. This tool is used during context compaction to reduce token usage while preserving key information.",
    schema: z.object({
      summary: z
        .string()
        .describe(
          "Compact summary of the conversation, preserving key decisions, context, and important details. Include enough information for the conversation to continue meaningfully."
        ),
    }),
  },
} as const;

/**
 * Get tool definition schemas for token counting
 * JSON schemas are auto-generated from zod schemas
 *
 * @returns Record of tool name to schema
 */
export function getToolSchemas(): Record<string, ToolSchema> {
  return Object.fromEntries(
    Object.entries(TOOL_DEFINITIONS).map(([name, def]) => [
      name,
      {
        name,
        description: def.description,
        inputSchema: zodToJsonSchema(def.schema) as ToolSchema["inputSchema"],
      },
    ])
  );
}

/**
 * Get which tools are available for a given model
 * @param modelString The model string (e.g., "anthropic:claude-opus-4-1")
 * @returns Array of tool names available for the model
 */
export function getAvailableTools(modelString: string): string[] {
  const [provider] = modelString.split(":");

  // Base tools available for all models
  const baseTools = [
    "bash",
    "file_read",
    "file_edit_replace",
    "file_edit_insert",
    "propose_plan",
    "compact_summary",
  ];

  // Add provider-specific tools
  switch (provider) {
    case "anthropic":
      return [...baseTools, "web_search"];
    case "openai":
      // Only some OpenAI models support web search
      if (modelString.includes("gpt-4") || modelString.includes("gpt-5")) {
        return [...baseTools, "web_search"];
      }
      return baseTools;
    case "google":
      return [...baseTools, "google_search"];
    default:
      return baseTools;
  }
}

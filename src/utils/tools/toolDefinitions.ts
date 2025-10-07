/**
 * Tool definitions module - Frontend-safe
 *
 * Single source of truth for all tool definitions.
 * Zod schemas are defined here and JSON schemas are auto-generated.
 */

import { z } from "zod";
import {
  BASH_DEFAULT_MAX_LINES,
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
 * Shared schema definitions
 */
const leaseSchema = z
  .string()
  .describe("The lease from the file_read result. Used to prevent edits on stale file state.");

/**
 * Tool definitions: single source of truth
 * Key = tool name, Value = { description, schema }
 */
export const TOOL_DEFINITIONS = {
  bash: {
    description:
      "Execute a bash command with a configurable timeout. " +
      `Output is limited to ${BASH_HARD_MAX_LINES} lines, ${BASH_MAX_LINE_BYTES} bytes per line, and ${BASH_MAX_TOTAL_BYTES} bytes total. ` +
      "Command will be killed if output exceeds these limits.",
    schema: z.object({
      script: z.string().describe("The bash script/command to execute"),
      timeout_secs: z
        .number()
        .positive()
        .describe(
          "Timeout (seconds). Start small and increase on retry; avoid large initial values to keep UX responsive"
        ),
      max_lines: z
        .number()
        .int()
        .positive()
        .max(
          BASH_HARD_MAX_LINES,
          `Maximum number of output lines to return (hard capped at ${BASH_HARD_MAX_LINES}). Command will be killed if output exceeds this limit.`
        )
        .default(BASH_DEFAULT_MAX_LINES),
      stdin: z
        .string()
        .optional()
        .describe(
          "Optional input to provide to the command via stdin. Useful for avoiding shell escaping issues when passing complex data to commands."
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
      "Apply one or more edits to a file by replacing exact text matches. All edits are applied sequentially. Each old_string must be unique in the file unless replace_count > 1 or replace_count is -1.",
    schema: z.object({
      file_path: z.string().describe("The absolute path to the file to edit"),
      edits: z
        .array(
          z.object({
            old_string: z
              .string()
              .describe(
                "The exact text to replace (must be unique in file if replace_count is 1). Include enough context (indentation, surrounding lines) to make it unique."
              ),
            new_string: z.string().describe("The replacement text"),
            replace_count: z
              .number()
              .int()
              .optional()
              .describe(
                "Number of occurrences to replace (default: 1). Use -1 to replace all occurrences. If 1, old_string must be unique in the file."
              ),
          })
        )
        .min(1)
        .describe("Array of edits to apply sequentially"),
      lease: leaseSchema,
    }),
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
      lease: leaseSchema,
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

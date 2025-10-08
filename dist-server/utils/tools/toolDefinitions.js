"use strict";
/**
 * Tool definitions module - Frontend-safe
 *
 * Single source of truth for all tool definitions.
 * Zod schemas are defined here and JSON schemas are auto-generated.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFINITIONS = void 0;
exports.getToolSchemas = getToolSchemas;
exports.getAvailableTools = getAvailableTools;
const zod_1 = require("zod");
const toolLimits_1 = require("../../constants/toolLimits");
const zod_to_json_schema_1 = require("zod-to-json-schema");
/**
 * Shared schema definitions
 */
const leaseSchema = zod_1.z
    .string()
    .describe("The lease from the file_read result. Used to prevent edits on stale file state.");
/**
 * Tool definitions: single source of truth
 * Key = tool name, Value = { description, schema }
 */
exports.TOOL_DEFINITIONS = {
    bash: {
        description: "Execute a bash command with a configurable timeout",
        schema: zod_1.z.object({
            script: zod_1.z.string().describe("The bash script/command to execute"),
            timeout_secs: zod_1.z
                .number()
                .positive()
                .describe("Timeout (seconds). Start small and increase on retry; avoid large initial values to keep UX responsive"),
            max_lines: zod_1.z
                .number()
                .int()
                .positive()
                .max(toolLimits_1.BASH_HARD_MAX_LINES, `Maximum number of output lines to return (hard capped at ${toolLimits_1.BASH_HARD_MAX_LINES}). Command will be killed if output exceeds this limit.`)
                .default(toolLimits_1.BASH_DEFAULT_MAX_LINES),
            stdin: zod_1.z
                .string()
                .optional()
                .describe("Optional input to provide to the command via stdin. Useful for avoiding shell escaping issues when passing complex data to commands."),
        }),
    },
    file_read: {
        description: "Read the contents of a file from the file system. Read as little as possible to complete the task.",
        schema: zod_1.z.object({
            filePath: zod_1.z.string().describe("The path to the file to read (absolute or relative)"),
            offset: zod_1.z
                .number()
                .int()
                .positive()
                .optional()
                .describe("1-based starting line number (optional, defaults to 1)"),
            limit: zod_1.z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Number of lines to return from offset (optional, returns all if not specified)"),
        }),
    },
    file_edit_replace: {
        description: "Apply one or more edits to a file by replacing exact text matches. All edits are applied sequentially. Each old_string must be unique in the file unless replace_count > 1 or replace_count is -1.",
        schema: zod_1.z.object({
            file_path: zod_1.z.string().describe("The absolute path to the file to edit"),
            edits: zod_1.z
                .array(zod_1.z.object({
                old_string: zod_1.z
                    .string()
                    .describe("The exact text to replace (must be unique in file if replace_count is 1). Include enough context (indentation, surrounding lines) to make it unique."),
                new_string: zod_1.z.string().describe("The replacement text"),
                replace_count: zod_1.z
                    .number()
                    .int()
                    .optional()
                    .describe("Number of occurrences to replace (default: 1). Use -1 to replace all occurrences. If 1, old_string must be unique in the file."),
            }))
                .min(1)
                .describe("Array of edits to apply sequentially"),
            lease: leaseSchema,
        }),
    },
    file_edit_insert: {
        description: "Insert content at a specific line position in a file. Line offset is 1-indexed: 0 inserts at the top, 1 inserts after line 1, etc.",
        schema: zod_1.z.object({
            file_path: zod_1.z.string().describe("The absolute path to the file to edit"),
            line_offset: zod_1.z
                .number()
                .int()
                .min(0)
                .describe("1-indexed line position (0 = insert at top, N = insert after line N)"),
            content: zod_1.z.string().describe("The content to insert"),
            lease: leaseSchema,
        }),
    },
    propose_plan: {
        description: "Propose a plan before taking action. The plan should be complete but minimal - cover what needs to be decided or understood, nothing more. Use this tool to get approval before proceeding with implementation.",
        schema: zod_1.z.object({
            title: zod_1.z
                .string()
                .describe("A short, descriptive title for the plan (e.g., 'Add User Authentication')"),
            plan: zod_1.z
                .string()
                .describe("Implementation plan in markdown (start at h2 level). " +
                "Scale the detail to match the task complexity: for straightforward changes, briefly state what and why; " +
                "for complex changes, explain approach, key decisions, risks/tradeoffs; " +
                "for uncertain changes, clarify options and what needs user input. " +
                "For highly complex concepts, use mermaid diagrams where they'd clarify better than text. " +
                "Cover what's necessary to understand and approve the approach. Omit obvious details or ceremony."),
        }),
    },
    compact_summary: {
        description: "Summarize the conversation history into a compact form. This tool is used during context compaction to reduce token usage while preserving key information.",
        schema: zod_1.z.object({
            summary: zod_1.z
                .string()
                .describe("Compact summary of the conversation, preserving key decisions, context, and important details. Include enough information for the conversation to continue meaningfully."),
        }),
    },
};
/**
 * Get tool definition schemas for token counting
 * JSON schemas are auto-generated from zod schemas
 *
 * @returns Record of tool name to schema
 */
function getToolSchemas() {
    return Object.fromEntries(Object.entries(exports.TOOL_DEFINITIONS).map(([name, def]) => [
        name,
        {
            name,
            description: def.description,
            inputSchema: (0, zod_to_json_schema_1.zodToJsonSchema)(def.schema),
        },
    ]));
}
/**
 * Get which tools are available for a given model
 * @param modelString The model string (e.g., "anthropic:claude-opus-4-1")
 * @returns Array of tool names available for the model
 */
function getAvailableTools(modelString) {
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
//# sourceMappingURL=toolDefinitions.js.map
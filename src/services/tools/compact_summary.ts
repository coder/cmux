import { tool } from "ai";
import type { ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";

/**
 * Compact summary tool factory for context compaction
 * Creates a tool that allows the AI to provide a conversation summary
 * @param config Required configuration (not used for this tool, but required by interface)
 */
export const createCompactSummaryTool: ToolFactory = () => {
  return tool({
    description: TOOL_DEFINITIONS.compact_summary.description,
    inputSchema: TOOL_DEFINITIONS.compact_summary.schema,
    execute: ({ summary }) => {
      // Tool execution is a no-op on the backend
      // The summary is intercepted by the frontend and used to replace history
      return Promise.resolve({
        success: true,
        summary,
        message: "Summary generated successfully.",
      });
    },
  });
};

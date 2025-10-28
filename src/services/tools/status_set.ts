import { tool } from "ai";
import type { ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";

/**
 * Status set tool factory for AI assistant
 * Creates a tool that allows the AI to set status indicator showing current activity
 * @param config Required configuration (not used for this tool, but required by interface)
 */
export const createStatusSetTool: ToolFactory = () => {
  return tool({
    description: TOOL_DEFINITIONS.status_set.description,
    inputSchema: TOOL_DEFINITIONS.status_set.schema,
    execute: ({ emoji, message }) => {
      // Tool execution is a no-op on the backend
      // The status is tracked by StreamingMessageAggregator and displayed in the frontend
      return Promise.resolve({
        success: true,
        emoji,
        message,
      });
    },
  });
};


import { tool } from "ai";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { executeFileEditOperation } from "./file_edit_operation";
import { handleLineReplace, type LineReplaceArgs } from "./file_edit_replace_shared";

export interface FileEditReplaceLinesResult {
  success: true;
  diff: string;
  edits_applied: number;
  lines_replaced: number;
  line_delta: number;
}

export interface FileEditReplaceLinesError {
  success: false;
  error: string;
}

export type FileEditReplaceLinesToolResult = FileEditReplaceLinesResult | FileEditReplaceLinesError;

/**
 * Line-based file edit replace tool factory
 */
export const createFileEditReplaceLinesTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    // @ts-expect-error - Tool is disabled, kept for backwards compatibility
    description: TOOL_DEFINITIONS.file_edit_replace_lines.description,
    // @ts-expect-error - Tool is disabled, kept for backwards compatibility
    inputSchema: TOOL_DEFINITIONS.file_edit_replace_lines.schema,
    execute: async (args: LineReplaceArgs): Promise<FileEditReplaceLinesToolResult> => {
      const result = await executeFileEditOperation({
        config,
        filePath: args.file_path,
        operation: (originalContent) => handleLineReplace(args, originalContent),
      });

      // handleLineReplace always returns lines_replaced and line_delta,
      // so we can safely assert this meets FileEditReplaceLinesToolResult
      if (result.success) {
        return {
          success: true,
          diff: result.diff,
          edits_applied: result.edits_applied,
          lines_replaced: result.lines_replaced!,
          line_delta: result.line_delta!,
        };
      }

      return result;
    },
  });
};

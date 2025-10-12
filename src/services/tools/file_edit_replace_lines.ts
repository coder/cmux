import { tool } from "ai";
import type { FileEditReplaceLinesToolArgs, FileEditReplaceLinesToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { executeFileEditOperation } from "./file_edit_operation";

/**
 * File edit replace (lines) tool factory for AI assistant
 * Applies line-range replacements sequentially with optional content validation.
 */
export const createFileEditReplaceLinesTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.file_edit_replace_lines.description,
    inputSchema: TOOL_DEFINITIONS.file_edit_replace_lines.schema,
    execute: async (
      args: FileEditReplaceLinesToolArgs
    ): Promise<FileEditReplaceLinesToolResult> => {
      return executeFileEditOperation({
        config,
        filePath: args.file_path,
        operation: (originalContent) => {
          let lines = originalContent.split("\n");
          let linesReplaced = 0;
          let totalDelta = 0;

          for (let i = 0; i < args.edits.length; i++) {
            const edit = args.edits[i];
            const startIndex = edit.start_line - 1;
            const endIndex = edit.end_line - 1;

            if (edit.start_line <= 0) {
              return {
                success: false,
                error: `Edit ${i + 1}: start_line must be >= 1 (received ${edit.start_line}).`,
              };
            }

            if (edit.end_line < edit.start_line) {
              return {
                success: false,
                error: `Edit ${i + 1}: end_line must be >= start_line (received start ${edit.start_line}, end ${edit.end_line}).`,
              };
            }

            if (startIndex >= lines.length) {
              return {
                success: false,
                error: `Edit ${i + 1}: start_line ${edit.start_line} exceeds current file length (${lines.length}).`,
              };
            }

            const clampedEndIndex = Math.min(endIndex, lines.length - 1);
            const currentRange = lines.slice(startIndex, clampedEndIndex + 1);

            if (edit.expected_lines && !arraysEqual(currentRange, edit.expected_lines)) {
              return {
                success: false,
                error: `Edit ${i + 1}: expected_lines validation failed. Current lines [${currentRange.join("\n")}] differ from expected [${edit.expected_lines.join("\n")}].`,
              };
            }

            const before = lines.slice(0, startIndex);
            const after = lines.slice(clampedEndIndex + 1);
            lines = [...before, ...edit.new_lines, ...after];

            linesReplaced += currentRange.length;
            totalDelta += edit.new_lines.length - currentRange.length;
          }

          return {
            success: true,
            newContent: lines.join("\n"),
            metadata: {
              edits_applied: args.edits.length,
              lines_replaced: linesReplaced,
              line_delta: totalDelta,
            },
          };
        },
      });
    },
  });
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

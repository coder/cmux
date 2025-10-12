import { tool } from "ai";
import type { FileEditReplaceLinesToolArgs, FileEditReplaceLinesToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { executeFileEditOperation } from "./file_edit_operation";

/**
 * File edit replace (lines) tool factory for AI assistant
 * Applies a single line-range replacement with optional content validation.
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
          const startIndex = args.start_line - 1;
          const endIndex = args.end_line - 1;

          if (args.start_line <= 0) {
            return {
              success: false,
              error: `start_line must be >= 1 (received ${args.start_line}).`,
            };
          }

          if (args.end_line < args.start_line) {
            return {
              success: false,
              error: `end_line must be >= start_line (received start ${args.start_line}, end ${args.end_line}).`,
            };
          }

          const lines = originalContent.split("\n");

          if (startIndex >= lines.length) {
            return {
              success: false,
              error: `start_line ${args.start_line} exceeds current file length (${lines.length}).`,
            };
          }

          const clampedEndIndex = Math.min(endIndex, lines.length - 1);
          const currentRange = lines.slice(startIndex, clampedEndIndex + 1);

          if (args.expected_lines && !arraysEqual(currentRange, args.expected_lines)) {
            return {
              success: false,
              error: `expected_lines validation failed. Current lines [${currentRange.join("\n")}] differ from expected [${args.expected_lines.join("\n")}].`,
            };
          }

          const before = lines.slice(0, startIndex);
          const after = lines.slice(clampedEndIndex + 1);
          const updatedLines = [...before, ...args.new_lines, ...after];
          const linesReplaced = currentRange.length;
          const totalDelta = args.new_lines.length - currentRange.length;

          return {
            success: true,
            newContent: updatedLines.join("\n"),
            metadata: {
              edits_applied: 1,
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

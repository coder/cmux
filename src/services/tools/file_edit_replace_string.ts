import { tool } from "ai";
import type { FileEditReplaceStringToolArgs, FileEditReplaceStringToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { executeFileEditOperation } from "./file_edit_operation";

/**
 * File edit replace (string) tool factory for AI assistant
 * Applies a single text replacement against file content.
 */
export const createFileEditReplaceStringTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.file_edit_replace_string.description,
    inputSchema: TOOL_DEFINITIONS.file_edit_replace_string.schema,
    execute: async (
      args: FileEditReplaceStringToolArgs
    ): Promise<FileEditReplaceStringToolResult> => {
      return executeFileEditOperation({
        config,
        filePath: args.file_path,
        operation: (originalContent) => {
          const replaceCount = args.replace_count ?? 1;

          if (!originalContent.includes(args.old_string)) {
            return {
              success: false,
              error: "old_string not found in file. The text to replace must exist exactly as written in the file.",
            };
          }

          const parts = originalContent.split(args.old_string);
          const occurrences = parts.length - 1;

          if (replaceCount === 1 && occurrences > 1) {
            return {
              success: false,
              error: `old_string appears ${occurrences} times in the file. Either expand the context to make it unique or set replace_count to ${occurrences} or -1.`,
            };
          }

          if (replaceCount > occurrences && replaceCount !== -1) {
            return {
              success: false,
              error: `replace_count is ${replaceCount} but old_string only appears ${occurrences} time(s) in the file.`,
            };
          }

          let newContent: string;
          let editsApplied: number;

          if (replaceCount === -1) {
            newContent = parts.join(args.new_string);
            editsApplied = occurrences;
          } else {
            let replacedCount = 0;
            let currentContent = originalContent;

            for (let i = 0; i < replaceCount; i++) {
              const index = currentContent.indexOf(args.old_string);
              if (index === -1) {
                break;
              }

              currentContent =
                currentContent.substring(0, index) +
                args.new_string +
                currentContent.substring(index + args.old_string.length);
              replacedCount++;
            }

            newContent = currentContent;
            editsApplied = replacedCount;
          }

          return {
            success: true,
            newContent,
            metadata: {
              edits_applied: editsApplied,
            },
          };
        },
      });
    },
  });
};

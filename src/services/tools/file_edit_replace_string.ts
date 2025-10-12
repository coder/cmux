import { tool } from "ai";
import type { FileEditReplaceStringToolArgs, FileEditReplaceStringToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { executeFileEditOperation } from "./file_edit_operation";

/**
 * File edit replace (string) tool factory for AI assistant
 * Applies multiple text replacement edits sequentially against file content.
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
          let content = originalContent;
          let editsApplied = 0;

          for (let i = 0; i < args.edits.length; i++) {
            const edit = args.edits[i];
            const replaceCount = edit.replace_count ?? 1;

            if (!content.includes(edit.old_string)) {
              return {
                success: false,
                error: `Edit ${i + 1}: old_string not found in file. The text to replace must exist exactly as written in the file.`,
              };
            }

            const parts = content.split(edit.old_string);
            const occurrences = parts.length - 1;

            if (replaceCount === 1 && occurrences > 1) {
              return {
                success: false,
                error: `Edit ${i + 1}: old_string appears ${occurrences} times in the file. Either expand the context to make it unique or set replace_count to ${occurrences} or -1.`,
              };
            }

            if (replaceCount > occurrences && replaceCount !== -1) {
              return {
                success: false,
                error: `Edit ${i + 1}: replace_count is ${replaceCount} but old_string only appears ${occurrences} time(s) in the file.`,
              };
            }

            if (replaceCount === -1) {
              content = parts.join(edit.new_string);
              editsApplied += occurrences;
            } else {
              let replacedCount = 0;
              let currentContent = content;

              for (let j = 0; j < replaceCount; j++) {
                const index = currentContent.indexOf(edit.old_string);
                if (index === -1) {
                  break;
                }

                currentContent =
                  currentContent.substring(0, index) +
                  edit.new_string +
                  currentContent.substring(index + edit.old_string.length);
                replacedCount++;
              }

              content = currentContent;
              editsApplied += replacedCount;
            }
          }

          return {
            success: true,
            newContent: content,
            metadata: {
              edits_applied: editsApplied,
            },
          };
        },
      });
    },
  });
};

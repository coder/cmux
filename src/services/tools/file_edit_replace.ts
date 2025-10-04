import { tool } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import writeFileAtomic from "write-file-atomic";
import type { FileEditReplaceToolResult } from "../../types/tools";
import type { ToolConfiguration, ToolFactory } from "../../utils/tools";
import { TOOL_DEFINITIONS } from "../../utils/toolDefinitions";
import { leaseFromStat } from "./fileCommon";

/**
 * File edit replace tool factory for AI assistant
 * Creates a tool that allows the AI to apply multiple edits to a file
 * @param config Required configuration including working directory
 */
export const createFileEditReplaceTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.file_edit_replace.description,
    inputSchema: TOOL_DEFINITIONS.file_edit_replace.schema,
    execute: async ({ file_path, edits, lease }): Promise<FileEditReplaceToolResult> => {
      try {
        // Resolve path (but expect absolute paths)
        const resolvedPath = path.isAbsolute(file_path)
          ? file_path
          : path.resolve(config.cwd, file_path);

        // Check if file exists
        const stats = await fs.stat(resolvedPath);
        if (!stats.isFile()) {
          return {
            success: false,
            error: `Path exists but is not a file: ${resolvedPath}`,
          };
        }

        // Validate lease to prevent editing stale file state
        const currentLease = leaseFromStat(stats);
        if (currentLease !== lease) {
          return {
            success: false,
            error: `File lease mismatch. The file has been modified since it was read. Please read the file again.`,
          };
        }

        // Read file content
        let content = await fs.readFile(resolvedPath, { encoding: "utf-8" });

        // Apply each edit sequentially
        // THE KEY INSIGHT: MultiEdit is a state machine where each edit operates on the
        // output of the previous edit, not the original file.
        //
        // For example, if the file contains "foo bar baz":
        //   Edit 1: "foo" -> "FOO" transforms content to "FOO bar baz"
        //   Edit 2: "bar" -> "BAR" operates on "FOO bar baz", resulting in "FOO BAR baz"
        //   Edit 3: "foo" -> "qux" would FAIL because "foo" no longer exists in the current state
        //
        // If ANY edit fails, the entire operation is rolled back - the file remains unchanged
        // because we only write to disk after all edits succeed.
        let editsApplied = 0;
        for (let i = 0; i < edits.length; i++) {
          const edit = edits[i];
          const replaceCount = edit.replace_count ?? 1; // Default to 1

          // Validate old_string exists in content
          if (!content.includes(edit.old_string)) {
            return {
              success: false,
              error: `Edit ${i + 1}: old_string not found in file. The text to replace must exist exactly as written in the file.`,
            };
          }

          // Count occurrences
          const parts = content.split(edit.old_string);
          const occurrences = parts.length - 1;

          // Check for uniqueness if replace_count is 1
          if (replaceCount === 1 && occurrences > 1) {
            return {
              success: false,
              error: `Edit ${i + 1}: old_string appears ${occurrences} times in the file. Either expand the context to make it unique or set replace_count to ${occurrences} or -1.`,
            };
          }

          // Validate replace_count doesn't exceed occurrences (unless -1)
          if (replaceCount > occurrences && replaceCount !== -1) {
            return {
              success: false,
              error: `Edit ${i + 1}: replace_count is ${replaceCount} but old_string only appears ${occurrences} time(s) in the file.`,
            };
          }

          // Apply the edit
          if (replaceCount === -1) {
            // Replace all occurrences
            content = parts.join(edit.new_string);
            editsApplied += occurrences;
          } else {
            // Replace the specified number of occurrences
            let replacedCount = 0;
            let currentContent = content;

            for (let j = 0; j < replaceCount; j++) {
              const index = currentContent.indexOf(edit.old_string);
              if (index !== -1) {
                currentContent =
                  currentContent.substring(0, index) +
                  edit.new_string +
                  currentContent.substring(index + edit.old_string.length);
                replacedCount++;
              } else {
                break;
              }
            }

            content = currentContent;
            editsApplied += replacedCount;
          }
        }

        // Write the modified content back to file atomically
        await writeFileAtomic(resolvedPath, content, { encoding: "utf-8" });

        // Get new file stats and compute new lease
        const newStats = await fs.stat(resolvedPath);
        const newLease = leaseFromStat(newStats);

        return {
          success: true,
          edits_applied: editsApplied,
          lease: newLease,
        };
      } catch (error) {
        // Handle specific errors
        if (error && typeof error === "object" && "code" in error) {
          if (error.code === "ENOENT") {
            return {
              success: false,
              error: `File not found: ${file_path}`,
            };
          } else if (error.code === "EACCES") {
            return {
              success: false,
              error: `Permission denied: ${file_path}`,
            };
          }
        }

        // Generic error
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to edit file: ${message}`,
        };
      }
    },
  });
};

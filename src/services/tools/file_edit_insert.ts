import { tool } from "ai";
import type { FileEditInsertToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { validatePathInCwd, validateNoRedundantPrefix } from "./fileCommon";
import { EDIT_FAILED_NOTE_PREFIX, NOTE_READ_FILE_RETRY } from "@/types/tools";
import { executeFileEditOperation } from "./file_edit_operation";
import { RuntimeError } from "@/runtime/Runtime";
import { fileExists } from "@/utils/runtime/fileExists";
import { writeFileString } from "@/utils/runtime/helpers";

/**
 * File edit insert tool factory for AI assistant
 * Creates a tool that allows the AI to insert content at a specific line position
 * @param config Required configuration including working directory
 */
export const createFileEditInsertTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.file_edit_insert.description,
    inputSchema: TOOL_DEFINITIONS.file_edit_insert.schema,
    execute: async (
      { file_path, line_offset, content, create },
      { abortSignal }
    ): Promise<FileEditInsertToolResult> => {
      try {
        // Validate no redundant path prefix (must come first to catch absolute paths)
        const redundantPrefixValidation = validateNoRedundantPrefix(
          file_path,
          config.cwd,
          config.runtime
        );
        if (redundantPrefixValidation) {
          return {
            success: false,
            error: redundantPrefixValidation.error,
          };
        }

        const pathValidation = validatePathInCwd(file_path, config.cwd, config.runtime);
        if (pathValidation) {
          return {
            success: false,
            error: pathValidation.error,
          };
        }

        if (line_offset < 0) {
          return {
            success: false,
            error: `line_offset must be non-negative (got ${line_offset})`,
            note: `${EDIT_FAILED_NOTE_PREFIX} The line_offset must be >= 0.`,
          };
        }

        // Use runtime's normalizePath method to resolve paths correctly for both local and SSH runtimes
        const resolvedPath = config.runtime.normalizePath(file_path, config.cwd);

        // Check if file exists using runtime
        const exists = await fileExists(config.runtime, resolvedPath, abortSignal);

        if (!exists) {
          if (!create) {
            return {
              success: false,
              error: `File not found: ${file_path}. To create it, set create: true`,
              note: `${EDIT_FAILED_NOTE_PREFIX} File does not exist. Set create: true to create it, or check the file path.`,
            };
          }

          // Create empty file using runtime helper
          try {
            await writeFileString(config.runtime, resolvedPath, "", abortSignal);
          } catch (err) {
            if (err instanceof RuntimeError) {
              return {
                success: false,
                error: err.message,
              };
            }
            throw err;
          }
        }

        return executeFileEditOperation({
          config,
          filePath: file_path,
          abortSignal,
          operation: (originalContent) => {
            const lines = originalContent.split("\n");

            if (line_offset > lines.length) {
              return {
                success: false,
                error: `line_offset ${line_offset} is beyond file length (${lines.length} lines)`,
                note: `${EDIT_FAILED_NOTE_PREFIX} The file has ${lines.length} lines. ${NOTE_READ_FILE_RETRY}`,
              };
            }

            // Handle newline behavior:
            // - If content ends with \n and we're not at EOF, strip it (join will add it back)
            // - If content ends with \n and we're at EOF, keep it (join won't add trailing newline)
            // - If content doesn't end with \n, keep as-is (join will add newlines between lines)
            const contentEndsWithNewline = content.endsWith("\n");
            const insertingAtEnd = line_offset === lines.length;
            const shouldStripTrailingNewline = contentEndsWithNewline && !insertingAtEnd;
            const normalizedContent = shouldStripTrailingNewline ? content.slice(0, -1) : content;

            const newLines = [
              ...lines.slice(0, line_offset),
              normalizedContent,
              ...lines.slice(line_offset),
            ];
            const newContent = newLines.join("\n");

            return {
              success: true,
              newContent,
              metadata: {},
            };
          },
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "EACCES") {
          return {
            success: false,
            error: `Permission denied: ${file_path}`,
          };
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to insert content: ${message}`,
        };
      }
    },
  });
};

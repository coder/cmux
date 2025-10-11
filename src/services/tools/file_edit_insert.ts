import { tool } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import writeFileAtomic from "write-file-atomic";
import type { FileEditInsertToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { generateDiff, validatePathInCwd, validateFileSize, WRITE_DENIED_PREFIX } from "./fileCommon";

/**
 * File edit insert tool factory for AI assistant
 * Creates a tool that allows the AI to insert content at a specific line position
 * @param config Required configuration including working directory
 */
export const createFileEditInsertTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.file_edit_insert.description,
    inputSchema: TOOL_DEFINITIONS.file_edit_insert.schema,
    execute: async ({ file_path, line_offset, content }): Promise<FileEditInsertToolResult> => {
      try {
        // Validate that the path is within the working directory
        const pathValidation = validatePathInCwd(file_path, config.cwd);
        if (pathValidation) {
          return {
            success: false,
            error: `${WRITE_DENIED_PREFIX} ${pathValidation.error}`,
          };
        }

        // Resolve path (but expect absolute paths)
        const resolvedPath = path.isAbsolute(file_path)
          ? file_path
          : path.resolve(config.cwd, file_path);

        // Check if file exists
        const stats = await fs.stat(resolvedPath);
        if (!stats.isFile()) {
          return {
            success: false,
            error: `${WRITE_DENIED_PREFIX} Path exists but is not a file: ${resolvedPath}`,
          };
        }

        // Validate file size
        const sizeValidation = validateFileSize(stats);
        if (sizeValidation) {
          return {
            success: false,
            error: `${WRITE_DENIED_PREFIX} ${sizeValidation.error}`,
          };
        }

        // Read file content
        const originalContent = await fs.readFile(resolvedPath, { encoding: "utf-8" });
        const lines = originalContent.split("\n");

        // Validate line_offset
        if (line_offset < 0) {
          return {
            success: false,
            error: `${WRITE_DENIED_PREFIX} line_offset must be non-negative (got ${line_offset})`,
          };
        }

        if (line_offset > lines.length) {
          return {
            success: false,
            error: `${WRITE_DENIED_PREFIX} line_offset ${line_offset} is beyond file length (${lines.length} lines)`,
          };
        }

        // Insert content at specified line
        // line_offset = 0: insert at top (before line 1)
        // line_offset = N: insert after line N
        const newLines = [...lines.slice(0, line_offset), content, ...lines.slice(line_offset)];
        const newContent = newLines.join("\n");

        // Write the modified content back to file atomically
        await writeFileAtomic(resolvedPath, newContent, { encoding: "utf-8" });

        // Generate diff
        const diff = generateDiff(resolvedPath, originalContent, newContent);

        return {
          success: true,
          diff,
        };
      } catch (error) {
        // Handle specific errors
        if (error && typeof error === "object" && "code" in error) {
          if (error.code === "ENOENT") {
            return {
              success: false,
              error: `${WRITE_DENIED_PREFIX} File not found: ${file_path}`,
            };
          } else if (error.code === "EACCES") {
            return {
              success: false,
              error: `${WRITE_DENIED_PREFIX} Permission denied: ${file_path}`,
            };
          }
        }

        // Generic error
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `${WRITE_DENIED_PREFIX} Failed to insert content: ${message}`,
        };
      }
    },
  });
};

import { tool } from "ai";
import * as path from "path";
import type { FileEditInsertToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { validatePathInCwd } from "./fileCommon";
import { WRITE_DENIED_PREFIX } from "@/types/tools";
import { executeFileEditOperation } from "./file_edit_operation";
import { RuntimeError } from "@/runtime/Runtime";
import { fileExists } from "@/utils/runtime/fileExists";
import { writeFileString } from "@/utils/runtime/helpers";
import { waitForWorkspaceInit } from "./toolHelpers";

/**
 * File edit insert tool factory for AI assistant
 * Creates a tool that allows the AI to insert content at a specific line position
 * @param config Required configuration including working directory
 */
export const createFileEditInsertTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.file_edit_insert.description,
    inputSchema: TOOL_DEFINITIONS.file_edit_insert.schema,
    execute: async ({
      file_path,
      line_offset,
      content,
      create,
    }): Promise<FileEditInsertToolResult> => {
      // Wait for workspace initialization to complete (no-op if already complete or not needed)
      const initError = await waitForWorkspaceInit(config, "insert into file");
      if (initError) {
        return {
          success: false,
          error: `${WRITE_DENIED_PREFIX} ${initError}`,
        };
      }

      try {
        const pathValidation = validatePathInCwd(file_path, config.cwd, config.runtime);
        if (pathValidation) {
          return {
            success: false,
            error: `${WRITE_DENIED_PREFIX} ${pathValidation.error}`,
          };
        }

        if (line_offset < 0) {
          return {
            success: false,
            error: `${WRITE_DENIED_PREFIX} line_offset must be non-negative (got ${line_offset})`,
          };
        }

        const resolvedPath = path.isAbsolute(file_path)
          ? file_path
          : path.resolve(config.cwd, file_path);

        // Check if file exists using runtime
        const exists = await fileExists(config.runtime, resolvedPath);

        if (!exists) {
          if (!create) {
            return {
              success: false,
              error: `${WRITE_DENIED_PREFIX} File not found: ${file_path}. To create it, set create: true`,
            };
          }

          // Create empty file using runtime helper
          try {
            await writeFileString(config.runtime, resolvedPath, "");
          } catch (err) {
            if (err instanceof RuntimeError) {
              return {
                success: false,
                error: `${WRITE_DENIED_PREFIX} ${err.message}`,
              };
            }
            throw err;
          }
        }

        return executeFileEditOperation({
          config,
          filePath: file_path,
          operation: (originalContent) => {
            const lines = originalContent.split("\n");

            if (line_offset > lines.length) {
              return {
                success: false,
                error: `line_offset ${line_offset} is beyond file length (${lines.length} lines)`,
              };
            }

            const newLines = [...lines.slice(0, line_offset), content, ...lines.slice(line_offset)];
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
            error: `${WRITE_DENIED_PREFIX} Permission denied: ${file_path}`,
          };
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `${WRITE_DENIED_PREFIX} Failed to insert content: ${message}`,
        };
      }
    },
  });
};

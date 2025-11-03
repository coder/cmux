import { tool } from "ai";
import type { FileSearchToolArgs, FileSearchToolResult, FileSearchMatch } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { validatePathInCwd, validateFileSize } from "./fileCommon";
import { readFileString } from "@/utils/runtime/helpers";
import { RuntimeError } from "@/runtime/Runtime";

const DEFAULT_CONTEXT_LINES = 3;
const DEFAULT_MAX_RESULTS = 100;

/**
 * File search tool factory for AI assistant
 * Searches for a pattern in a file and returns matching lines with context
 */
export const createFileSearchTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.file_search.description,
    inputSchema: TOOL_DEFINITIONS.file_search.schema,
    execute: async (
      args: FileSearchToolArgs,
      { abortSignal: _abortSignal }
    ): Promise<FileSearchToolResult> => {
      try {
        const { file_path, pattern, context_lines, max_results } = args;

        // Validate path is within workspace
        const pathValidation = validatePathInCwd(file_path, config.cwd, config.runtime);
        if (pathValidation) {
          return {
            success: false,
            error: pathValidation.error,
          };
        }

        // Resolve path using runtime
        const resolvedPath = config.runtime.normalizePath(file_path, config.cwd);

        // Check file exists and get stats
        let fileStat;
        try {
          fileStat = await config.runtime.stat(resolvedPath);
        } catch (err) {
          if (err instanceof RuntimeError) {
            return {
              success: false,
              error: err.message,
            };
          }
          throw err;
        }

        if (fileStat.isDirectory) {
          return {
            success: false,
            error: `Path is a directory, not a file: ${resolvedPath}`,
          };
        }

        const sizeValidation = validateFileSize(fileStat);
        if (sizeValidation) {
          return {
            success: false,
            error: sizeValidation.error,
          };
        }

        // Read file content
        let content: string;
        try {
          content = await readFileString(config.runtime, resolvedPath);
        } catch (err) {
          if (err instanceof RuntimeError) {
            return {
              success: false,
              error: err.message,
            };
          }
          throw err;
        }

        // Split into lines and search
        const lines = content.split("\n");
        const contextLinesCount = context_lines ?? DEFAULT_CONTEXT_LINES;
        const maxResults = max_results ?? DEFAULT_MAX_RESULTS;
        const matches: FileSearchMatch[] = [];

        // Find all matching lines
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(pattern)) {
            // Calculate context range
            const startIdx = Math.max(0, i - contextLinesCount);
            const endIdx = Math.min(lines.length - 1, i + contextLinesCount);

            const match: FileSearchMatch = {
              line_number: i + 1, // 1-indexed
              line_content: lines[i],
              context_before: lines.slice(startIdx, i),
              context_after: lines.slice(i + 1, endIdx + 1),
            };

            matches.push(match);

            // Stop if we've reached max results
            if (matches.length >= maxResults) {
              break;
            }
          }
        }

        return {
          success: true,
          file_path: resolvedPath,
          pattern,
          matches,
          total_matches: matches.length,
          file_size: fileStat.size,
        };
      } catch (error) {
        if (error && typeof error === "object" && "code" in error) {
          const nodeError = error as { code?: string };
          if (nodeError.code === "ENOENT") {
            return {
              success: false,
              error: `File not found: ${args.file_path}`,
            };
          }

          if (nodeError.code === "EACCES") {
            return {
              success: false,
              error: `Permission denied: ${args.file_path}`,
            };
          }
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to search file: ${message}`,
        };
      }
    },
  });
};

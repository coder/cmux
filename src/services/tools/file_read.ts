import { tool } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import type { FileReadToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { leaseFromContent, validatePathInCwd, validateFileSize } from "./fileCommon";

/**
 * File read tool factory for AI assistant
 * Creates a tool that allows the AI to read file contents from the file system
 * @param config Required configuration including working directory
 */
export const createFileReadTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.file_read.description,
    inputSchema: TOOL_DEFINITIONS.file_read.schema,
    execute: async (
      { filePath, offset, limit },
      { abortSignal: _abortSignal }
    ): Promise<FileReadToolResult> => {
      // Note: abortSignal available but not used - file reads are fast and complete quickly
      try {
        // Validate that the path is within the working directory
        const pathValidation = validatePathInCwd(filePath, config.cwd);
        if (pathValidation) {
          return {
            success: false,
            error: pathValidation.error,
          };
        }

        // Resolve relative paths from configured working directory
        const resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(config.cwd, filePath);

        // Check if file exists
        const stats = await fs.stat(resolvedPath);
        if (!stats.isFile()) {
          return {
            success: false,
            error: `Path exists but is not a file: ${resolvedPath}`,
          };
        }

        // Validate file size
        const sizeValidation = validateFileSize(stats);
        if (sizeValidation) {
          return {
            success: false,
            error: sizeValidation.error,
          };
        }

        // Read full file content once for both display and lease computation
        // This ensures lease matches the exact content snapshot being returned
        const fullContent = await fs.readFile(resolvedPath, { encoding: "utf-8" });
        const lease = leaseFromContent(fullContent);

        const startLineNumber = offset ?? 1;

        // Validate offset
        if (offset !== undefined && offset < 1) {
          return {
            success: false,
            error: `Offset must be positive (got ${offset})`,
          };
        }

        // Split content into lines for processing
        // Handle empty file case: splitting "" by "\n" gives [""], but we want []
        const lines = fullContent === "" ? [] : fullContent.split("\n");

        // Validate offset
        if (offset !== undefined && offset > lines.length) {
          return {
            success: false,
            error: `Offset ${offset} is beyond file length`,
          };
        }

        const numberedLines: string[] = [];
        let totalBytesAccumulated = 0;
        const MAX_LINE_BYTES = 1024;
        const MAX_LINES = 1000;
        const MAX_TOTAL_BYTES = 16 * 1024; // 16KB

        // Process lines with offset and limit
        const startIdx = startLineNumber - 1; // Convert to 0-based index
        const endIdx = limit !== undefined ? startIdx + limit : lines.length;

        for (let i = startIdx; i < Math.min(endIdx, lines.length); i++) {
          const line = lines[i];
          const lineNumber = i + 1;

          // Truncate line if it exceeds max bytes
          let processedLine = line;
          const lineBytes = Buffer.byteLength(line, "utf-8");
          if (lineBytes > MAX_LINE_BYTES) {
            // Truncate to MAX_LINE_BYTES
            processedLine = Buffer.from(line, "utf-8")
              .subarray(0, MAX_LINE_BYTES)
              .toString("utf-8");
            processedLine += "... [truncated]";
          }

          // Format line with number prefix
          const numberedLine = `${lineNumber}\t${processedLine}`;
          const numberedLineBytes = Buffer.byteLength(numberedLine, "utf-8");

          // Check if adding this line would exceed byte limit
          if (totalBytesAccumulated + numberedLineBytes > MAX_TOTAL_BYTES) {
            return {
              success: false,
              error: `Output would exceed ${MAX_TOTAL_BYTES} bytes. Please read less at a time using offset and limit parameters.`,
            };
          }

          numberedLines.push(numberedLine);
          totalBytesAccumulated += numberedLineBytes + 1; // +1 for newline

          // Check if we've exceeded max lines
          if (numberedLines.length > MAX_LINES) {
            return {
              success: false,
              error: `Output would exceed ${MAX_LINES} lines. Please read less at a time using offset and limit parameters.`,
            };
          }
        }

        // Join lines with newlines
        const content = numberedLines.join("\n");

        // Return file info and content
        // IMPORTANT: lease must be last in the return object so it remains fresh in the LLM's context
        // when it's reading this tool result. The LLM needs the lease value to perform subsequent edits.
        return {
          success: true,
          file_size: stats.size,
          modifiedTime: stats.mtime.toISOString(),
          lines_read: numberedLines.length,
          content,
          lease, // Must be last - see comment above
        };
      } catch (error) {
        // Handle specific errors
        if (error && typeof error === "object" && "code" in error) {
          if (error.code === "ENOENT") {
            return {
              success: false,
              error: `File not found: ${filePath}`,
            };
          } else if (error.code === "EACCES") {
            return {
              success: false,
              error: `Permission denied: ${filePath}`,
            };
          }
        }

        // Generic error
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to read file: ${message}`,
        };
      }
    },
  });
};

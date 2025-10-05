import { tool } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import type { FileReadToolResult } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { leaseFromStat, validatePathInCwd } from "./fileCommon";

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

        // Compute lease for this file state
        const lease = leaseFromStat(stats);

        const startLineNumber = offset ?? 1;

        // Validate offset
        if (offset !== undefined && offset < 1) {
          return {
            success: false,
            error: `Offset must be positive (got ${offset})`,
          };
        }

        // Open file with using for automatic cleanup
        await using fileHandle = await fs.open(resolvedPath, "r");

        // Create readline interface for line-by-line reading
        const rl = readline.createInterface({
          input: fileHandle.createReadStream({ encoding: "utf-8" }),
          crlfDelay: Infinity,
        });

        const numberedLines: string[] = [];
        let currentLineNumber = 1;
        let totalLinesRead = 0;
        let totalBytesAccumulated = 0;
        const MAX_LINE_BYTES = 1024;
        const MAX_LINES = 1000;
        const MAX_TOTAL_BYTES = 16 * 1024; // 16KB

        // Iterate through file line by line
        for await (const line of rl) {
          // Skip lines before offset
          if (currentLineNumber < startLineNumber) {
            currentLineNumber++;
            continue;
          }

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
          const numberedLine = `${currentLineNumber}\t${processedLine}`;
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
          totalLinesRead++;
          currentLineNumber++;

          // Check if we've exceeded max lines
          if (totalLinesRead > MAX_LINES) {
            return {
              success: false,
              error: `Output would exceed ${MAX_LINES} lines. Please read less at a time using offset and limit parameters.`,
            };
          }

          // Stop if we've collected enough lines
          if (limit !== undefined && totalLinesRead >= limit) {
            break;
          }
        }

        // Check if offset was beyond file length
        if (offset !== undefined && numberedLines.length === 0) {
          return {
            success: false,
            error: `Offset ${offset} is beyond file length`,
          };
        }

        // Join lines with newlines
        const content = numberedLines.join("\n");

        // Return file info and content
        return {
          success: true,
          file_size: stats.size,
          modifiedTime: stats.mtime.toISOString(),
          lines_read: numberedLines.length,
          content,
          lease,
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

import { tool } from "ai";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ReadFileToolArgs, ReadFileToolResult } from "../../types/tools";
import type { ToolConfiguration, ToolFactory } from "../../utils/tools";

/**
 * Read file tool factory for AI assistant
 * Creates a tool that allows the AI to read file contents from the file system
 * @param config Required configuration including working directory
 */
export const createReadFileTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description:
      "Read the contents of a file from the file system. Read as little as possible to complete the task.",
    inputSchema: z.object({
      filePath: z.string().describe("The path to the file to read (absolute or relative)"),
      encoding: z
        .enum(["utf-8", "ascii", "base64", "hex", "binary"])
        .optional()
        .default("utf-8")
        .describe("The encoding to use when reading the file"),
      offset: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("1-based starting line number (optional, defaults to 1)"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of lines to return from offset (optional, returns all if not specified)"),
    }) satisfies z.ZodType<ReadFileToolArgs>,
    execute: async ({ filePath, encoding, offset, limit }): Promise<ReadFileToolResult> => {
      try {
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

        // Read entire file content
        const fullContent = await fs.readFile(resolvedPath, { encoding });
        const lines = fullContent.split("\n");

        // Determine which lines to return
        let selectedLines: string[];
        if (offset === undefined && limit === undefined) {
          // No offset or limit: return entire file
          selectedLines = lines;
        } else {
          // Convert 1-based offset to 0-based index (default to line 1)
          const startIdx = offset !== undefined ? offset - 1 : 0;

          if (startIdx < 0) {
            return {
              success: false,
              error: `Offset must be positive (got ${offset})`,
            };
          }

          if (startIdx >= lines.length) {
            return {
              success: false,
              error: `Offset ${offset} is beyond file length (${lines.length} lines)`,
            };
          }

          // Calculate end index
          const endIdx = limit !== undefined ? startIdx + limit : lines.length;

          // Extract the selected lines
          selectedLines = lines.slice(startIdx, endIdx);
        }

        // Rejoin lines with newlines
        const content = selectedLines.join("\n");
        const bytesRead = Buffer.byteLength(content, encoding);

        // Return file info and content
        return {
          success: true,
          size: stats.size,
          modifiedTime: stats.mtime.toISOString(),
          encoding,
          bytes_read: bytesRead,
          content,
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

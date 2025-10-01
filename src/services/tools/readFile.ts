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
      start: z.number().int().nonnegative().describe("Starting byte offset (inclusive)"),
      end: z.number().int().positive().describe("Ending byte offset (exclusive)"),
    }) satisfies z.ZodType<ReadFileToolArgs>,
    execute: async ({ filePath, encoding, start, end }): Promise<ReadFileToolResult> => {
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

        // Validate byte range
        if (start >= stats.size) {
          return {
            success: false,
            error: `Start offset ${start} is beyond file size ${stats.size}`,
          };
        }
        if (start >= end) {
          return {
            success: false,
            error: `Start offset ${start} must be less than end offset ${end}`,
          };
        }

        // Clamp end offset to file size
        const effectiveEnd = Math.min(end, stats.size);

        // Use efficient byte range reading
        const fileHandle = await fs.open(resolvedPath, "r");
        let content: string;
        let bytesRead: number;
        try {
          const bytesToRead = effectiveEnd - start;
          const buffer = Buffer.alloc(bytesToRead);

          // Read specific byte range using seek
          const result = await fileHandle.read(buffer, 0, bytesToRead, start);
          bytesRead = result.bytesRead;
          content = buffer.toString(encoding, 0, bytesRead);
        } finally {
          await fileHandle.close();
        }

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

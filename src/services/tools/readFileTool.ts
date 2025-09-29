import { tool } from "ai";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Read-file tool for AI assistant
 * Allows the AI to read file contents from the file system
 */
export const readFileTool = tool({
  description: "Read the contents of a file from the file system",
  inputSchema: z.object({
    filePath: z.string().describe("The path to the file to read (absolute or relative)"),
    encoding: z
      .enum(["utf-8", "ascii", "base64", "hex", "binary"])
      .optional()
      .default("utf-8")
      .describe("The encoding to use when reading the file"),
  }),
  execute: async ({ filePath, encoding }) => {
    try {
      // Resolve relative paths from current working directory
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      // Check if file exists
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        return {
          success: false,
          error: `Path exists but is not a file: ${resolvedPath}`,
        };
      }

      // Read file contents
      const content = await fs.readFile(resolvedPath, encoding);

      // Return file info and content
      return {
        success: true,
        filePath: resolvedPath,
        size: stats.size,
        modifiedTime: stats.mtime.toISOString(),
        encoding,
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

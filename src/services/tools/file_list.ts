import { tool } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import { minimatch } from "minimatch";
import ignore from "ignore";
import type { FileEntry, FileListToolResult } from "@/types/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { validatePathInCwd } from "./fileCommon";
import {
  FILE_LIST_DEFAULT_DEPTH,
  FILE_LIST_DEFAULT_MAX_ENTRIES,
  FILE_LIST_HARD_MAX_ENTRIES,
  FILE_LIST_MAX_DEPTH,
} from "@/constants/toolLimits";

interface TraversalOptions {
  pattern?: string;
  maxEntries: number;
}

interface TraversalResult {
  entries: FileEntry[];
  totalCount: number;
  exceeded: boolean;
}

/**
 * Format a file tree as a string with tree characters (├─, └─, │)
 * Recursively formats the tree structure for display to LLM
 */
function formatTreeAsString(entries: FileEntry[], indent = "", isLast: boolean[] = []): string {
  const lines: string[] = [];

  entries.forEach((entry, i) => {
    const isLastEntry = i === entries.length - 1;
    const prefix = isLast.length > 0 ? indent + (isLastEntry ? "└─ " : "├─ ") : "";

    const suffix = entry.type === "directory" ? "/" : "";
    const sizeInfo = entry.size !== undefined ? ` (${formatSize(entry.size)})` : "";

    lines.push(`${prefix}${entry.name}${suffix}${sizeInfo}`);

    // Recursively render children if present
    if (entry.children && entry.children.length > 0) {
      const newIndent = indent + (isLastEntry ? "   " : "│  ");
      lines.push(
        ...formatTreeAsString(entry.children, newIndent, [...isLast, isLastEntry]).split("\n")
      );
    }
  });

  return lines.join("\n");
}

/**
 * Format a file size in bytes to a human-readable string
 * No decimals to preserve tokens in LLM output
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/**
 * Load and parse .gitignore file if it exists
 */
async function loadGitignore(rootPath: string): Promise<ReturnType<typeof ignore> | null> {
  const gitignorePath = path.join(rootPath, ".gitignore");
  try {
    const content = await fs.readFile(gitignorePath, "utf-8");
    const ig = ignore();
    ig.add(content);
    return ig;
  } catch {
    // No .gitignore file, return empty ignore instance
    return ignore();
  }
}

/**
 * Creates the file_list tool for listing directory contents with recursive traversal.
 *
 * Features:
 * - Non-recursive by default (depth: 1)
 * - Optional pattern filtering with glob support
 * - Respects .gitignore by default
 * - Hard limit enforcement (returns error instead of truncating)
 * - Sorted output (directories first, then files, alphabetically)
 *
 * @param config - Tool configuration with cwd
 * @returns Tool definition for file_list
 */
export function createFileListTool(config: { cwd: string }) {
  return tool({
    description: TOOL_DEFINITIONS.file_list.description,
    inputSchema: TOOL_DEFINITIONS.file_list.schema,
    execute: async (args, { abortSignal: _abortSignal }): Promise<FileListToolResult> => {
      const {
        path: targetPath,
        max_depth = FILE_LIST_DEFAULT_DEPTH,
        pattern,
        gitignore = true,
        max_entries = FILE_LIST_DEFAULT_MAX_ENTRIES,
      } = args;

      // Validate path is within cwd
      const pathError = validatePathInCwd(targetPath, config.cwd);
      if (pathError) {
        return { success: false, error: pathError.error };
      }

      // Resolve to absolute path
      const resolvedPath = path.isAbsolute(targetPath)
        ? path.resolve(targetPath)
        : path.resolve(config.cwd, targetPath);

      // Check if path exists and is a directory
      let stats;
      try {
        stats = await fs.stat(resolvedPath);
      } catch {
        return {
          success: false,
          error: `Path does not exist: ${targetPath}`,
        };
      }

      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Path is not a directory: ${targetPath}`,
        };
      }

      // Enforce depth limit
      const effectiveDepth = Math.min(Math.max(1, max_depth), FILE_LIST_MAX_DEPTH);

      // Enforce entry limit
      const effectiveMaxEntries = Math.min(Math.max(1, max_entries), FILE_LIST_HARD_MAX_ENTRIES);

      // Load .gitignore if requested (loaded once, used across entire traversal via closure)
      const ig = gitignore ? await loadGitignore(resolvedPath) : null;

      /**
       * Recursively build a file tree structure with depth control and filtering.
       * Uses closure to access ig (ignore instance) and resolvedPath without passing them through recursion.
       * Counts entries as they're added and stops when limit is reached.
       *
       * @param dir - Directory to traverse
       * @param currentDepth - Current depth level (1 = immediate children)
       * @param maxDepth - Maximum depth to traverse
       * @param options - Filtering options (pattern, entry limit)
       * @param currentCount - Shared counter tracking total entries across recursion
       * @returns Tree structure with entries, total count, and exceeded flag
       */
      async function buildFileTree(
        dir: string,
        currentDepth: number,
        maxDepth: number,
        options: TraversalOptions,
        currentCount: { value: number }
      ): Promise<TraversalResult> {
        // Check if we've already exceeded the limit
        if (currentCount.value >= options.maxEntries) {
          return { entries: [], totalCount: currentCount.value, exceeded: true };
        }

        let dirents;
        try {
          dirents = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          // If we can't read the directory (permissions, etc.), skip it
          return { entries: [], totalCount: currentCount.value, exceeded: false };
        }

        // Sort: directories first, then files, alphabetically within each group
        dirents.sort((a, b) => {
          const aIsDir = a.isDirectory();
          const bIsDir = b.isDirectory();
          if (aIsDir && !bIsDir) return -1;
          if (!aIsDir && bIsDir) return 1;
          return a.name.localeCompare(b.name);
        });

        const entries: FileEntry[] = [];

        for (const dirent of dirents) {
          const fullPath = path.join(dir, dirent.name);
          const entryType = dirent.isDirectory()
            ? "directory"
            : dirent.isFile()
              ? "file"
              : "symlink";

          // Always skip .git directory regardless of gitignore setting
          if (dirent.name === ".git" && entryType === "directory") {
            continue;
          }

          // Check gitignore filtering (uses ig from closure)
          if (gitignore && ig) {
            const relativePath = path.relative(resolvedPath, fullPath);
            // Add trailing slash for directories for proper gitignore matching
            const pathToCheck = entryType === "directory" ? relativePath + "/" : relativePath;
            if (ig.ignores(pathToCheck)) {
              continue;
            }
          }

          // For pattern matching:
          // - If it's a file, check if it matches the pattern
          // - If it's a directory, we'll add it provisionally and remove it later if it has no matches
          let matchesPattern = true;
          if (options.pattern && entryType === "file") {
            matchesPattern = minimatch(dirent.name, options.pattern, { matchBase: true });
          }

          // Skip files that don't match pattern
          if (entryType === "file" && !matchesPattern) {
            continue;
          }

          // Check limit before adding (even for directories we'll explore)
          if (currentCount.value >= options.maxEntries) {
            return { entries, totalCount: currentCount.value + 1, exceeded: true };
          }

          // Increment counter
          currentCount.value++;

          const entry: FileEntry = {
            name: dirent.name,
            type: entryType,
          };

          // Get size for files
          if (entryType === "file") {
            try {
              const stats = await fs.stat(fullPath);
              entry.size = stats.size;
            } catch {
              // If we can't stat the file, skip size
            }
          }

          // Recurse into directories if within depth limit
          if (entryType === "directory" && currentDepth < maxDepth) {
            const result = await buildFileTree(
              fullPath,
              currentDepth + 1,
              maxDepth,
              options,
              currentCount
            );

            if (result.exceeded) {
              // Don't add this directory since we exceeded the limit while processing it
              currentCount.value--; // Revert the increment for this directory
              return { entries, totalCount: result.totalCount, exceeded: true };
            }

            entry.children = result.entries;

            // If we have a pattern and this directory has no matching descendants, skip it
            if (options.pattern && entry.children.length === 0) {
              currentCount.value--; // Revert the increment
              continue;
            }
          }

          entries.push(entry);
        }

        return { entries, totalCount: currentCount.value, exceeded: false };
      }

      // Build the file tree
      const currentCount = { value: 0 };
      const result = await buildFileTree(
        resolvedPath,
        1,
        effectiveDepth,
        {
          pattern,
          maxEntries: effectiveMaxEntries,
        },
        currentCount
      );

      // If we exceeded the limit, return an error with guidance
      if (result.exceeded) {
        const errorMsg = [
          `Directory listing would exceed limit of ${effectiveMaxEntries} entries.`,
          `Found ${result.totalCount}+ total entries.`,
          `Use max_entries parameter to set a higher limit (max: ${FILE_LIST_HARD_MAX_ENTRIES})`,
          `or narrow your search with pattern/depth.`,
        ].join(" ");

        return {
          success: false,
          error: errorMsg,
          total_found: result.totalCount,
          limit_requested: effectiveMaxEntries,
        };
      }

      // Format tree as string for LLM (token efficient)
      const output =
        result.entries.length === 0 ? "(empty directory)" : formatTreeAsString(result.entries);

      return {
        success: true,
        path: resolvedPath,
        output: output,
        total_count: result.totalCount,
        depth_used: effectiveDepth,
      };
    },
  });
}

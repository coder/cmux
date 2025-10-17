import { tool } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import { minimatch } from "minimatch";
import ignore from "ignore";
import type { FileEntry, FileListToolArgs, FileListToolResult } from "@/types/tools";
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
  useGitignore: boolean;
  maxEntries: number;
  ig: ReturnType<typeof ignore> | null; // Ignore instance loaded once from .gitignore, reused across recursion
  rootPath: string; // Root path for calculating relative paths in gitignore matching
}

interface TraversalResult {
  entries: FileEntry[];
  totalCount: number;
  exceeded: boolean;
}

/**
 * Recursively build a file tree structure with depth control and filtering.
 * Counts entries as they're added and stops when limit is reached.
 *
 * @param dir - Directory to traverse
 * @param currentDepth - Current depth level (1 = immediate children)
 * @param maxDepth - Maximum depth to traverse
 * @param options - Filtering options (pattern, gitignore, entry limit)
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
  } catch (err) {
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
    const entryType = dirent.isDirectory() ? "directory" : dirent.isFile() ? "file" : "symlink";

    // Always skip .git directory regardless of gitignore setting
    if (dirent.name === ".git" && entryType === "directory") {
      continue;
    }

    // Check gitignore filtering
    if (options.useGitignore && options.ig) {
      const relativePath = path.relative(options.rootPath, fullPath);
      // Add trailing slash for directories for proper gitignore matching
      const pathToCheck = entryType === "directory" ? relativePath + "/" : relativePath;
      if (options.ig.ignores(pathToCheck)) {
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
      } catch (err) {
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

      // Load .gitignore if requested
      const ig = gitignore ? await loadGitignore(resolvedPath) : null;

      // Build the file tree
      const currentCount = { value: 0 };
      const result = await buildFileTree(
        resolvedPath,
        1,
        effectiveDepth,
        {
          pattern,
          useGitignore: gitignore,
          maxEntries: effectiveMaxEntries,
          ig,
          rootPath: resolvedPath,
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

      return {
        success: true,
        path: resolvedPath,
        entries: result.entries,
        total_count: result.totalCount,
        depth_used: effectiveDepth,
      };
    },
  });
}

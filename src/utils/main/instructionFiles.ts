import * as fs from "fs/promises";
import * as path from "path";

/**
 * Instruction file names to search for, in priority order.
 * The first file found in a directory is used as the base instruction set.
 */
export const INSTRUCTION_FILE_NAMES = ["AGENTS.md", "AGENT.md", "CLAUDE.md"] as const;

/**
 * Local instruction file suffix. If a base instruction file is found,
 * we also look for a matching .local.md variant in the same directory.
 *
 * Example: If AGENTS.md exists, we also check for AGENTS.local.md
 */
const LOCAL_INSTRUCTION_FILENAME = "AGENTS.local.md";

/**
 * Attempts to read the first available file from a list of filenames in a directory.
 *
 * @param directory - Directory to search in
 * @param filenames - List of filenames to try, in priority order
 * @returns Content of the first file found, or null if none exist
 */
export async function readFirstAvailableFile(
  directory: string,
  filenames: readonly string[]
): Promise<string | null> {
  for (const filename of filenames) {
    try {
      const filePath = path.join(directory, filename);
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch {
      // File doesn't exist or can't be read, try next
      continue;
    }
  }
  return null;
}

/**
 * Attempts to read a local variant of an instruction file.
 *
 * Local files allow users to keep personal preferences separate from
 * shared team instructions (e.g., add AGENTS.local.md to .gitignore).
 *
 * @param directory - Directory to search in
 * @returns Content of the local instruction file, or null if it doesn't exist
 */
export async function readLocalInstructionFile(directory: string): Promise<string | null> {
  try {
    const localFilePath = path.join(directory, LOCAL_INSTRUCTION_FILENAME);
    const content = await fs.readFile(localFilePath, "utf-8");
    return content;
  } catch {
    // Local file doesn't exist, which is fine
    return null;
  }
}

/**
 * Reads a base file with an optional local variant and returns their combined content.
 *
 * @param directory - Directory to search (can be null/undefined)
 * @param baseFilenames - Base filenames to try in priority order
 * @param localFilename - Optional local filename to append if present
 * @returns Combined content or null if no base file exists
 */
export async function readFileWithLocalVariant(
  directory: string | null | undefined,
  baseFilenames: readonly string[],
  localFilename?: string
): Promise<string | null> {
  if (!directory) {
    return null;
  }

  const normalizedDirectory = path.resolve(directory);
  const baseContent = await readFirstAvailableFile(normalizedDirectory, baseFilenames);

  if (!baseContent) {
    return null;
  }

  if (!localFilename) {
    return baseContent;
  }

  try {
    const localFilePath = path.join(normalizedDirectory, localFilename);
    const localContent = await fs.readFile(localFilePath, "utf-8");
    return `${baseContent}\n\n${localContent}`;
  } catch {
    return baseContent;
  }
}

/**
 * Reads an instruction set from a directory.
 *
 * An instruction set consists of:
 * 1. A base instruction file (first found from INSTRUCTION_FILE_NAMES)
 * 2. An optional local instruction file (AGENTS.local.md)
 *
 * If both exist, they are concatenated with a blank line separator.
 *
 * @param directory - Directory to search for instruction files
 * @returns Combined instruction content, or null if no base file exists
 */
export async function readInstructionSet(directory: string): Promise<string | null> {
  return readFileWithLocalVariant(directory, INSTRUCTION_FILE_NAMES, LOCAL_INSTRUCTION_FILENAME);
}

/**
 * Searches for instruction files across multiple directories in priority order.
 *
 * Each directory is searched for a complete instruction set (base + local).
 * All found instruction sets are returned as separate segments.
 *
 * This allows for layered instructions where:
 * - Global instructions (~/.cmux/AGENTS.md) apply to all projects
 * - Project instructions (workspace/AGENTS.md) add project-specific context
 *
 * @param directories - List of directories to search, in priority order
 * @returns Array of instruction segments (one per directory with instructions)
 */
export async function gatherInstructionSets(directories: string[]): Promise<string[]> {
  const segments: string[] = [];

  for (const directory of directories) {
    const instructionSet = await readInstructionSet(directory);
    if (instructionSet) {
      segments.push(instructionSet);
    }
  }

  return segments;
}

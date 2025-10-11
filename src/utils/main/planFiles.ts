import { readFirstAvailableFile } from "./instructionFiles";

/**
 * Plan file location within the .cmux directory.
 *
 * This file contains planning context and notes for the current workspace.
 * It can exist at either the system level (~/.cmux/.cmux/PLAN.md) or
 * workspace level (workspace/.cmux/PLAN.md).
 */
const PLAN_FILE_PATH = ".cmux/PLAN.md";
const PLAN_FILE_LOCAL_PATH = ".cmux/PLAN.local.md";

/**
 * Reads a plan file set from a base directory.
 *
 * Checks for .cmux/PLAN.md and .cmux/PLAN.local.md in the base directory,
 * combining them if both exist.
 *
 * @param baseDirectory - Base directory to search in
 * @returns Combined plan content, or null if no plan file exists
 */
async function readPlanSet(baseDirectory: string): Promise<string | null> {
  let content: string | null = null;

  // Try base plan file first
  try {
    content = await readFirstAvailableFile(baseDirectory, [PLAN_FILE_PATH]);
  } catch {
    // File doesn't exist
  }

  // Try local plan file
  let localContent: string | null = null;
  try {
    localContent = await readFirstAvailableFile(baseDirectory, [PLAN_FILE_LOCAL_PATH]);
  } catch {
    // File doesn't exist
  }

  // Combine if both exist
  if (content && localContent) {
    return `${content}\n\n${localContent}`;
  }

  // Return whichever exists, or null
  return content ?? localContent;
}

/**
 * Searches for plan files across multiple base directories and layers them.
 *
 * For each base directory, checks:
 * 1. .cmux/PLAN.md (shared plan)
 * 2. .cmux/PLAN.local.md (local-only plan)
 *
 * Layers all found plan files together:
 * - Global plans (~/.cmux/.cmux/PLAN.md + PLAN.local.md)
 * - Workspace plans (<workspace>/.cmux/PLAN.md + PLAN.local.md)
 *
 * @param baseDirectories - List of base directories to search (e.g., [systemDir, workspaceDir])
 * @returns Combined plan content from all directories, or null if none exist
 */
export async function readPlanFile(baseDirectories: string[]): Promise<string | null> {
  const segments: string[] = [];

  for (const baseDir of baseDirectories) {
    const planSet = await readPlanSet(baseDir);
    if (planSet) {
      segments.push(planSet);
    }
  }

  return segments.length > 0 ? segments.join("\n\n") : null;
}

import * as path from "path";
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
 * Searches for a plan file across multiple base directories.
 *
 * For each base directory, checks:
 * 1. .cmux/PLAN.md (shared plan)
 * 2. .cmux/PLAN.local.md (local-only plan)
 *
 * Returns the first plan file found, prioritizing base over local.
 *
 * @param baseDirectories - List of base directories to search (e.g., [systemDir, workspaceDir])
 * @returns Content of the first plan file found, or null if none exist
 */
export async function readPlanFile(baseDirectories: string[]): Promise<string | null> {
  const planPaths = [PLAN_FILE_PATH, PLAN_FILE_LOCAL_PATH];

  for (const baseDir of baseDirectories) {
    const content = await readFirstAvailableFile(baseDir, planPaths);
    if (content) {
      return content;
    }
  }

  return null;
}

import * as fs from "fs/promises";
import * as path from "path";

/**
 * Prompt file information
 */
export interface PromptFile {
  /** Name of the prompt (filename without .md extension) */
  name: string;
  /** Full path to the prompt file */
  path: string;
  /** Location where the prompt was found (repo or system) */
  location: "repo" | "system";
}

/**
 * Finds all markdown prompt files in a directory
 *
 * @param directory - Directory to search for prompt files
 * @param location - Whether this is a repo or system directory
 * @returns Array of prompt files found
 */
async function findPromptsInDirectory(
  directory: string,
  location: "repo" | "system"
): Promise<PromptFile[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const prompts: PromptFile[] = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const name = entry.name.slice(0, -3); // Remove .md extension
        prompts.push({
          name,
          path: path.join(directory, entry.name),
          location,
        });
      }
    }

    return prompts;
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }
}

/**
 * Lists all available prompt files across multiple directories
 *
 * Searches in priority order:
 * 1. Repository .cmux directory (if provided)
 * 2. System ~/.cmux/prompts directory (if provided)
 *
 * Repository prompts take precedence over system prompts with the same name.
 *
 * @param repoPromptsDir - Path to repository .cmux directory (optional)
 * @param systemPromptsDir - Path to system ~/.cmux/prompts directory (optional)
 * @returns Array of available prompts (deduplicated, repo prompts override system)
 */
export async function listPrompts(
  repoPromptsDir?: string,
  systemPromptsDir?: string
): Promise<PromptFile[]> {
  const repoPrompts = repoPromptsDir ? await findPromptsInDirectory(repoPromptsDir, "repo") : [];
  const systemPrompts = systemPromptsDir
    ? await findPromptsInDirectory(systemPromptsDir, "system")
    : [];

  // Deduplicate: repo prompts override system prompts with same name
  const promptMap = new Map<string, PromptFile>();

  // Add system prompts first
  for (const prompt of systemPrompts) {
    promptMap.set(prompt.name, prompt);
  }

  // Override with repo prompts
  for (const prompt of repoPrompts) {
    promptMap.set(prompt.name, prompt);
  }

  return Array.from(promptMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reads the content of a prompt file
 *
 * @param promptPath - Full path to the prompt file
 * @returns Content of the prompt file, or null if it doesn't exist
 */
export async function readPrompt(promptPath: string): Promise<string | null> {
  try {
    return await fs.readFile(promptPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Finds a prompt by name across multiple directories
 *
 * Searches in priority order:
 * 1. Repository .cmux directory
 * 2. System ~/.cmux/prompts directory
 *
 * @param promptName - Name of the prompt (without .md extension)
 * @param repoPromptsDir - Path to repository .cmux directory (optional)
 * @param systemPromptsDir - Path to system ~/.cmux/prompts directory (optional)
 * @returns Content of the prompt, or null if not found
 */
export async function findAndReadPrompt(
  promptName: string,
  repoPromptsDir?: string,
  systemPromptsDir?: string
): Promise<string | null> {
  const filename = `${promptName}.md`;

  // Try repo directory first
  if (repoPromptsDir) {
    const repoPath = path.join(repoPromptsDir, filename);
    const content = await readPrompt(repoPath);
    if (content !== null) {
      return content;
    }
  }

  // Try system directory
  if (systemPromptsDir) {
    const systemPath = path.join(systemPromptsDir, filename);
    return await readPrompt(systemPath);
  }

  return null;
}

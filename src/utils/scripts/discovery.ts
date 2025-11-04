import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import type { Runtime } from "@/runtime/Runtime";
import { execBuffered } from "@/utils/runtime/helpers";

/**
 * Information about a discovered script
 */
export interface ScriptInfo {
  /** Script filename (e.g., "deploy") */
  name: string;
  /** Optional description extracted from script comments */
  description?: string;
  /** Whether the script is executable */
  isExecutable: boolean;
}

/**
 * List all scripts in .cmux/scripts/ directory for a workspace
 * @param runtime - Runtime to use for listing scripts (supports local and SSH)
 * @param workspacePath - Path to the workspace directory
 * @returns Array of script information, sorted by name
 */
export async function listScripts(runtime: Runtime, workspacePath: string): Promise<ScriptInfo[]> {
  const scriptsDir = path.join(workspacePath, ".cmux", "scripts");

  try {
    // List files in .cmux/scripts/ directory via runtime
    // Using find with -maxdepth 1 to list only files in the directory (not subdirectories)
    const listResult = await execBuffered(
      runtime,
      `find "${scriptsDir}" -maxdepth 1 -type f -printf '%f\\n' 2>/dev/null | sort || true`,
      {
        cwd: workspacePath,
        timeout: 5,
      }
    );

    if (listResult.exitCode !== 0 && listResult.stdout.trim() === "") {
      // Directory doesn't exist or can't be read
      return [];
    }

    const filenames = listResult.stdout
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    if (filenames.length === 0) {
      return [];
    }

    // For each file, check if executable and extract description
    const scripts: ScriptInfo[] = [];

    for (const filename of filenames) {
      const scriptPath = path.join(scriptsDir, filename);

      // Check if executable via test command
      const execCheckResult = await execBuffered(
        runtime,
        `test -x "${scriptPath}" && echo "true" || echo "false"`,
        {
          cwd: workspacePath,
          timeout: 3,
        }
      );

      const isExecutable = execCheckResult.stdout.trim() === "true";

      // Extract description from first comment lines
      const descResult = await execBuffered(
        runtime,
        `head -n 20 "${scriptPath}" 2>/dev/null || true`,
        {
          cwd: workspacePath,
          timeout: 3,
        }
      );

      const description = extractDescriptionFromContent(descResult.stdout);

      scripts.push({
        name: filename,
        description,
        isExecutable,
      });
    }

    return scripts.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }
}

/**
 * Extract description from script content by parsing first comment lines
 * Looks for patterns like:
 * - # Description: <text>
 * - # @description <text> (tool-style)
 * - # <text> (first comment line)
 * @param content - Script file content
 * @returns Description text or undefined
 */
function extractDescriptionFromContent(content: string): string | undefined {
  const lines = content.split("\n").slice(0, 20); // Check first 20 lines

  for (const line of lines) {
    // Look for "# Description: ..." format
    const descMatch = /^#\s*Description:\s*(.+)$/i.exec(line);
    if (descMatch) {
      return descMatch[1].trim();
    }

    // Look for "# @description ..." format (tool-style)
    const toolDescMatch = /^#\s*@description\s+(.+)$/i.exec(line);
    if (toolDescMatch) {
      return toolDescMatch[1].trim();
    }
  }

  // Fallback: use first comment line that's not shebang
  for (const line of lines) {
    if (line.startsWith("#!")) {
      continue; // Skip shebang
    }

    const commentMatch = /^#\s*(.+)$/.exec(line);
    if (commentMatch) {
      const text = commentMatch[1].trim();
      if (text.length > 0 && text.length < 100) {
        return text;
      }
    }

    // Stop at first non-comment line
    if (line.trim().length > 0 && !line.startsWith("#")) {
      break;
    }
  }

  return undefined;
}

/**
 * Get the full path to a script
 * @param workspacePath - Path to the workspace directory
 * @param scriptName - Name of the script file
 * @returns Full path to script
 */
export function getScriptPath(workspacePath: string, scriptName: string): string {
  return path.join(workspacePath, ".cmux", "scripts", scriptName);
}

/**
 * Check if a script exists and is executable
 * @param workspacePath - Path to the workspace directory
 * @param scriptName - Name of the script file
 * @returns true if script exists and is executable
 */
export async function checkScriptExecutable(
  workspacePath: string,
  scriptName: string
): Promise<boolean> {
  const scriptPath = getScriptPath(workspacePath, scriptName);

  try {
    await fsPromises.access(scriptPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

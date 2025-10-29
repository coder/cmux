import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Result of path validation
 */
export interface PathValidationResult {
  valid: boolean;
  expandedPath?: string;
  error?: string;
}

/**
 * Expand tilde (~) in paths to the user's home directory
 * 
 * @param inputPath - Path that may contain tilde
 * @returns Path with tilde expanded to home directory
 * 
 * @example
 * expandTilde("~/Documents") // => "/home/user/Documents"
 * expandTilde("~") // => "/home/user"
 * expandTilde("/absolute/path") // => "/absolute/path"
 */
export function expandTilde(inputPath: string): string {
  if (!inputPath) {
    return inputPath;
  }

  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

/**
 * Validate that a project path exists and is a directory
 * Automatically expands tilde and normalizes the path
 * 
 * @param inputPath - Path to validate (may contain tilde)
 * @returns Validation result with expanded path or error
 * 
 * @example
 * validateProjectPath("~/my-project")
 * // => { valid: true, expandedPath: "/home/user/my-project" }
 * 
 * validateProjectPath("~/nonexistent")
 * // => { valid: false, error: "Path does not exist: /home/user/nonexistent" }
 */
export function validateProjectPath(inputPath: string): PathValidationResult {
  // Expand tilde if present
  const expandedPath = expandTilde(inputPath);
  
  // Normalize to resolve any .. or . in the path
  const normalizedPath = path.normalize(expandedPath);

  // Check if path exists
  // eslint-disable-next-line local/no-sync-fs-methods -- Synchronous validation required for IPC handler
  if (!fs.existsSync(normalizedPath)) {
    return {
      valid: false,
      error: `Path does not exist: ${normalizedPath}`,
    };
  }

  // Check if it's a directory
  // eslint-disable-next-line local/no-sync-fs-methods -- Synchronous validation required for IPC handler
  const stats = fs.statSync(normalizedPath);
  if (!stats.isDirectory()) {
    return {
      valid: false,
      error: `Path is not a directory: ${normalizedPath}`,
    };
  }

  return {
    valid: true,
    expandedPath: normalizedPath,
  };
}


import * as os from "os";

/**
 * UI-specific path formatting utilities for displaying paths to users.
 * These utilities handle platform-specific conventions for showing paths in the UI.
 *
 * These functions are designed for the renderer process and use window.api.platform
 * for platform detection.
 */

/**
 * Get the current platform (renderer-safe)
 */
function getPlatform(): string {
  // In renderer process, use window.api.platform
  if (typeof window !== "undefined" && window.api?.platform) {
    return window.api.platform;
  }
  // Fallback for tests or main process (not used in renderer bundle)
  // eslint-disable-next-line no-restricted-globals
  return typeof process !== "undefined" ? process.platform : "linux";
}

/**
 * Format workspace location for display in the UI
 *
 * @param projectName - Name of the project
 * @param branchName - Name of the branch/workspace
 * @param isSSH - Whether this is an SSH workspace
 * @returns Formatted path string for display
 *
 * @example
 * // Local Unix workspace
 * formatWorkspaceLocation("cmux", "main", false) // => "~/.cmux/src/cmux/main"
 *
 * // Local Windows workspace
 * formatWorkspaceLocation("cmux", "main", false) // => "C:\\Users\\user\\.cmux\\src\\cmux\\main"
 *
 * // SSH workspace (always Unix-style)
 * formatWorkspaceLocation("cmux", "main", true) // => "~/cmux/main"
 */
export function formatWorkspaceLocation(
  projectName: string,
  branchName: string,
  isSSH = false
): string {
  if (isSSH) {
    // SSH workspaces always use Unix-style paths
    return `~/cmux/${branchName}`;
  }

  const isWindows = getPlatform() === "win32";

  if (isWindows) {
    // Windows: Show full path with proper separators
    const home = os.homedir();
    return `${home}\\.cmux\\src\\${projectName}\\${branchName}`;
  } else {
    // Unix: Use tilde for home directory
    return `~/.cmux/src/${projectName}/${branchName}`;
  }
}

/**
 * Format config file path for display in the UI
 *
 * @param filename - Name of the config file
 * @returns Formatted config path string
 *
 * @example
 * // Unix
 * formatConfigPath("secrets.json") // => "~/.cmux/secrets.json"
 *
 * // Windows
 * formatConfigPath("secrets.json") // => "%USERPROFILE%\\.cmux\\secrets.json"
 */
export function formatConfigPath(filename: string): string {
  const isWindows = getPlatform() === "win32";

  if (isWindows) {
    // Windows: Use %USERPROFILE% environment variable for portability
    return `%USERPROFILE%\\.cmux\\${filename}`;
  } else {
    // Unix: Use tilde
    return `~/.cmux/${filename}`;
  }
}

/**
 * Format SSH host path for display (always Unix-style)
 *
 * @param sshHost - SSH host name
 * @param remotePath - Remote path (relative to home)
 * @returns Formatted SSH path
 *
 * @example
 * formatSSHHostPath("dev.example.com", "cmux/project")
 * // => "dev.example.com:~/cmux/project"
 */
export function formatSSHHostPath(sshHost: string, remotePath: string): string {
  // Ensure remotePath starts with ~/
  const normalizedPath = remotePath.startsWith("~/") ? remotePath : `~/${remotePath}`;
  return `${sshHost}:${normalizedPath}`;
}

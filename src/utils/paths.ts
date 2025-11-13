/**
 * Platform-aware path utilities for cross-platform compatibility.
 * Handles differences between Unix-style paths (/) and Windows paths (\).
 *
 * This module is safe for BOTH main and renderer. It does NOT import Node's
 * 'path' or 'os' modules to avoid bundling issues in the renderer.
 */

export interface PathComponents {
  root: string; // "/" on Unix, "C:\\" on Windows, "" for relative paths
  segments: string[]; // Directory segments (excluding basename)
  basename: string; // Final path component
}

/**
 * Determine if current platform is Windows
 */
function isWindowsPlatform(): boolean {
  return typeof process !== "undefined" && process.platform === "win32";
}

function getSeparator(): string {
  return isWindowsPlatform() ? "\\" : "/";
}

function getHomeDir(): string {
  if (isWindowsPlatform()) {
    return (typeof process !== "undefined" ? process.env?.USERPROFILE : undefined) ?? "";
  }

  return (typeof process !== "undefined" ? process.env?.HOME : undefined) ?? "";
}

/**
 * OS-aware path utilities that handle Windows and Unix paths correctly.
 * This class provides a single source of truth for path operations that need
 * to be aware of platform differences.
 */
export class PlatformPaths {
  /**
   * Get the appropriate path separator for the current platform
   */
  static get separator(): string {
    return getSeparator();
  }

  /**
   * Extract basename from path (OS-aware)
   *
   * @param filePath - Path to extract basename from
   * @returns The final component of the path
   *
   * @example
   * // Unix
   * basename("/home/user/project") // => "project"
   *
   * // Windows
   * basename("C:\\Users\\user\\project") // => "project"
   */
  static basename(filePath: string): string {
    if (!filePath || typeof filePath !== "string") {
      return filePath;
    }

    const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
    if (lastSlash === -1) {
      return filePath;
    }
    return filePath.slice(lastSlash + 1);
  }

  /**
   * Split path into components (OS-aware)
   *
   * @param filePath - Path to parse
   * @returns Object with root, segments, and basename
   *
   * @example
   * // Unix
   * parse("/home/user/project") // => { root: "/", segments: ["home", "user"], basename: "project" }
   *
   * // Windows
   * parse("C:\\Users\\user\\project") // => { root: "C:\\", segments: ["Users", "user"], basename: "project" }
   */
  static parse(filePath: string): PathComponents {
    if (!filePath || typeof filePath !== "string") {
      return { root: "", segments: [], basename: filePath };
    }

    const original = filePath;
    let root = "";
    let dir = "";
    let base = "";

    // Determine basename and directory
    const lastSlash = Math.max(original.lastIndexOf("/"), original.lastIndexOf("\\"));
    if (lastSlash === -1) {
      base = original;
      dir = "";
    } else {
      base = original.slice(lastSlash + 1);
      dir = original.slice(0, lastSlash);
    }

    // Determine root
    if (isWindowsPlatform()) {
      const driveMatch = /^[A-Za-z]:[\\/]/.exec(original);
      if (driveMatch) {
        root = driveMatch[0];
        // Ensure dir does not include root
        if (dir.startsWith(root)) {
          dir = dir.slice(root.length);
        }
      } else if (original.startsWith("\\\\")) {
        // UNC paths - treat leading double-backslash as root
        root = "\\\\";
        if (dir.startsWith(root)) {
          dir = dir.slice(root.length);
        }
      }
      // Also treat Unix-style absolute paths as absolute even on Windows
      if (!root && original.startsWith("/")) {
        root = "/";
        if (dir.startsWith(root)) {
          dir = dir.slice(root.length);
        }
      }
    } else if (original.startsWith("/")) {
      root = "/";
      if (dir.startsWith(root)) {
        dir = dir.slice(root.length);
      }
    }

    const segments = dir ? dir.split(/[\\/]+/).filter(Boolean) : [];

    return {
      root,
      segments,
      basename: base,
    };
  }

  /**
   * Format path for display with fish-style abbreviation (OS-aware)
   * Abbreviates all directory components except the last one to their first letter
   *
   * @param filePath - Path to abbreviate
   * @returns Abbreviated path
   *
   * @example
   * // Unix
   * abbreviate("/home/user/Projects/cmux") // => "/h/u/P/cmux"
   *
   * // Windows
   * abbreviate("C:\\Users\\john\\Documents\\project") // => "C:\\U\\j\\D\\project"
   */
  static abbreviate(filePath: string): string {
    if (!filePath || typeof filePath !== "string") {
      return filePath;
    }

    const { root, segments, basename } = this.parse(filePath);

    // Abbreviate all segments to first character
    const abbreviated = segments.map((seg) => (seg.length > 0 ? seg[0] : seg));

    // Reconstruct path - handle root separately to avoid double separator
    if (!root && abbreviated.length === 0) {
      return basename;
    }

    const sep = filePath.includes("\\") ? "\\" : "/";
    const joined = [...abbreviated, basename].filter(Boolean).join(sep);
    if (!root) {
      return joined;
    }
    const rootEndsWithSep = root.endsWith("\\") || root.endsWith("/");
    return rootEndsWithSep ? root + joined : root + sep + joined;
  }

  /**
   * Split an abbreviated path into directory path and basename
   *
   * @param filePath - Abbreviated path
   * @returns Object with dirPath (including trailing separator) and basename
   *
   * @example
   * splitAbbreviated("/h/u/P/cmux") // => { dirPath: "/h/u/P/", basename: "cmux" }
   */
  static splitAbbreviated(filePath: string): { dirPath: string; basename: string } {
    if (!filePath || typeof filePath !== "string") {
      return { dirPath: "", basename: filePath };
    }

    const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
    if (lastSlash === -1) {
      return { dirPath: "", basename: filePath };
    }
    return {
      dirPath: filePath.slice(0, lastSlash + 1),
      basename: filePath.slice(lastSlash + 1),
    };
  }

  /**
   * Format home directory path for display (shows ~ on Unix, full path on Windows)
   *
   * @param filePath - Path that may contain home directory
   * @returns Formatted path with ~ substitution on Unix
   *
   * @example
   * // Unix
   * formatHome("/home/user/project") // => "~/project"
   *
   * // Windows (no substitution)
   * formatHome("C:\\Users\\john\\project") // => "C:\\Users\\john\\project"
   */
  static formatHome(filePath: string): string {
    if (!filePath || typeof filePath !== "string") {
      return filePath;
    }

    const home = getHomeDir();
    if (!home) {
      return filePath;
    }

    // On Unix, replace home with tilde
    // On Windows, show full path (no tilde convention)
    if (!isWindowsPlatform() && filePath.startsWith(home)) {
      return filePath.replace(home, "~");
    }

    return filePath;
  }

  /**
   * Expand user home in path (cross-platform)
   * Handles ~ on Unix and %USERPROFILE% on Windows
   *
   * @param filePath - Path that may contain home directory placeholder
   * @returns Expanded path with actual home directory
   *
   * @example
   * // Unix
   * expandHome("~/project") // => "/home/user/project"
   *
   * // Windows
   * expandHome("%USERPROFILE%\\project") // => "C:\\Users\\user\\project"
   */
  static expandHome(filePath: string): string {
    if (!filePath || typeof filePath !== "string") {
      return filePath;
    }

    if (filePath === "~") {
      return getHomeDir() || filePath;
    }

    // Handle Unix-style ~/path
    if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
      const home = getHomeDir();
      if (!home) return filePath;
      const sep = getSeparator();
      const rest = filePath.slice(2);
      return home + (rest ? sep + rest.replace(/[\\/]+/g, sep) : "");
    }

    // Handle Windows %USERPROFILE% environment variable
    if (isWindowsPlatform() && filePath.includes("%USERPROFILE%")) {
      const home = getHomeDir();
      if (!home) return filePath;
      return filePath.replace(/%USERPROFILE%/g, home);
    }

    return filePath;
  }

  /**
   * Get project name from path (OS-aware)
   * Extracts the final directory name from a project path
   *
   * @param projectPath - Path to the project
   * @returns Project name (final directory component)
   *
   * @example
   * getProjectName("/home/user/projects/cmux") // => "cmux"
   * getProjectName("C:\\Users\\john\\projects\\cmux") // => "cmux"
   */
  static getProjectName(projectPath: string): string {
    return this.basename(projectPath) || "unknown";
  }
}

import * as os from "os";
import * as path from "path";

/**
 * Platform-aware path utilities for cross-platform compatibility.
 * Handles differences between Unix-style paths (/) and Windows paths (\).
 *
 * NOTE: These utilities are designed to work in the main process where `process` is available.
 * If you need platform-specific behavior in the renderer, use the path formatting utilities
 * from `utils/ui/pathFormatting.ts` which handle the platform detection properly.
 */

export interface PathComponents {
  root: string; // "/" on Unix, "C:\\" on Windows, "" for relative paths
  segments: string[]; // Directory segments (excluding basename)
  basename: string; // Final path component
}

/**
 * Check if running on Windows (main process only)
 * In renderer process, this will return the build-time platform
 */
function isWindowsPlatform(): boolean {
  // In main process, use process.platform
  // In renderer (where process might not be available), path.sep is a reliable indicator
  try {
    return process.platform === "win32";
  } catch {
    // Fallback: use path.sep which is set at build time
    return path.sep === "\\";
  }
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
    return path.sep;
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

    // Use Node's path.basename which is already platform-aware
    return path.basename(filePath);
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

    // Normalize path to use platform-appropriate separators
    const normalized = path.normalize(filePath);

    // Get the root (drive letter on Windows, / on Unix)
    const parsedPath = path.parse(normalized);
    const root = parsedPath.root;

    // Split the directory part into segments
    const dir = parsedPath.dir.slice(root.length); // Remove root from dir
    const segments = dir ? dir.split(path.sep).filter(Boolean) : [];

    return {
      root,
      segments,
      basename: parsedPath.base,
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

    const pathParts: string[] = [];
    if (root) {
      pathParts.push(root);
    }
    pathParts.push(...abbreviated);
    if (basename) {
      pathParts.push(basename);
    }

    // Join with separator, but be careful with root
    if (root === this.separator) {
      // Unix-style root: join everything after root with separator
      return root + pathParts.slice(1).join(this.separator);
    } else {
      // Windows-style root or no root: join all parts
      return pathParts.join(this.separator);
    }
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

    const { root, segments, basename } = this.parse(filePath);

    if (segments.length === 0 && !root) {
      return { dirPath: "", basename };
    }

    // Reconstruct directory path with trailing separator
    if (root === this.separator) {
      // Unix-style: /seg1/seg2/
      const dirPath =
        root + segments.join(this.separator) + (segments.length > 0 ? this.separator : "");
      return { dirPath, basename };
    } else {
      // Windows-style or relative: C:\seg1\seg2\ or seg1\seg2\
      const parts = root ? [root, ...segments] : segments;
      const dirPath = parts.length > 0 ? parts.join(this.separator) + this.separator : "";
      return { dirPath, basename };
    }
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

    const home = os.homedir();

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
      return os.homedir();
    }

    // Handle Unix-style ~/path
    if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
      return path.join(os.homedir(), filePath.slice(2));
    }

    // Handle Windows %USERPROFILE% environment variable
    if (isWindowsPlatform() && filePath.includes("%USERPROFILE%")) {
      return filePath.replace(/%USERPROFILE%/g, os.homedir());
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

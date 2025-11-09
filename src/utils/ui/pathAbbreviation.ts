import { PlatformPaths } from "../platform/paths";

/**
 * Fish-style path abbreviation utility (OS-aware)
 * Abbreviates all directory components except the last one to their first letter
 *
 * @example
 * // Unix
 * abbreviatePath("/Users/ammar/Projects/coder/cmux") // => "/U/a/P/c/cmux"
 *
 * // Windows
 * abbreviatePath("C:\\Users\\john\\Documents\\project") // => "C:\\U\\j\\D\\project"
 */
export function abbreviatePath(path: string): string {
  return PlatformPaths.abbreviate(path);
}

/**
 * Split an abbreviated path into directory path and basename (OS-aware)
 *
 * @example
 * // Unix
 * splitAbbreviatedPath("/U/a/P/c/cmux") // => { dirPath: "/U/a/P/c/", basename: "cmux" }
 *
 * // Windows
 * splitAbbreviatedPath("C:\\U\\j\\D\\project") // => { dirPath: "C:\\U\\j\\D\\", basename: "project" }
 */
export function splitAbbreviatedPath(path: string): { dirPath: string; basename: string } {
  return PlatformPaths.splitAbbreviated(path);
}

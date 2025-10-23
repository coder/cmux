import type { Runtime } from "@/runtime/Runtime";

/**
 * Check if a path exists using runtime.stat()
 * @param runtime Runtime instance to use
 * @param path Path to check
 * @returns True if path exists, false otherwise
 */
export async function fileExists(runtime: Runtime, path: string): Promise<boolean> {
  try {
    await runtime.stat(path);
    return true;
  } catch {
    return false;
  }
}

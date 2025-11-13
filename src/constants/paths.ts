import { homedir } from "os";
import { join } from "path";

/**
 * Get the root directory for all cmux configuration and data.
 * Can be overridden with CMUX_TEST_ROOT environment variable.
 *
 * This is a getter function to support test mocking of os.homedir().
 *
 * Note: This file is only used by main process code, but lives in constants/
 * for organizational purposes. The process.env access is safe.
 */
export function getCmuxHome(): string {
  // eslint-disable-next-line no-restricted-syntax, no-restricted-globals
  return process.env.CMUX_TEST_ROOT ?? join(homedir(), ".cmux");
}

/**
 * Get the directory where workspace git worktrees are stored.
 * Example: ~/.cmux/src/my-project/feature-branch
 *
 * @param rootDir - Optional root directory (defaults to getCmuxHome())
 */
export function getCmuxSrcDir(rootDir?: string): string {
  const root = rootDir ?? getCmuxHome();
  return join(root, "src");
}

/**
 * Get the directory where session chat histories are stored.
 * Example: ~/.cmux/sessions/workspace-id/chat.jsonl
 *
 * @param rootDir - Optional root directory (defaults to getCmuxHome())
 */
export function getCmuxSessionsDir(rootDir?: string): string {
  const root = rootDir ?? getCmuxHome();
  return join(root, "sessions");
}

/**
 * Get the main configuration file path.
 *
 * @param rootDir - Optional root directory (defaults to getCmuxHome())
 */
export function getCmuxConfigFile(rootDir?: string): string {
  const root = rootDir ?? getCmuxHome();
  return join(root, "config.json");
}

/**
 * Get the providers configuration file path.
 *
 * @param rootDir - Optional root directory (defaults to getCmuxHome())
 */
export function getCmuxProvidersFile(rootDir?: string): string {
  const root = rootDir ?? getCmuxHome();
  return join(root, "providers.jsonc");
}

/**
 * Get the secrets file path.
 *
 * @param rootDir - Optional root directory (defaults to getCmuxHome())
 */
export function getCmuxSecretsFile(rootDir?: string): string {
  const root = rootDir ?? getCmuxHome();
  return join(root, "secrets.json");
}

/**
 * Get the extension metadata file path (shared with VS Code extension).
 *
 * @param rootDir - Optional root directory (defaults to getCmuxHome())
 */
export function getCmuxExtensionMetadataPath(rootDir?: string): string {
  const root = rootDir ?? getCmuxHome();
  return join(root, "extensionMetadata.json");
}

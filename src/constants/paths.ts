import { homedir } from "os";
import { join } from "path";

/**
 * Get the root directory for all cmux configuration and data.
 * Can be overridden with CMUX_TEST_ROOT environment variable.
 *
 * This is a getter function to support test mocking of os.homedir().
 */
export function getCmuxHome(): string {
  return process.env.CMUX_TEST_ROOT ?? join(homedir(), ".cmux");
}

/**
 * Root directory for all cmux configuration and data.
 * Can be overridden with CMUX_TEST_ROOT environment variable.
 *
 * Note: For most use cases, prefer getCmuxHome() over this constant
 * to support test mocking of os.homedir().
 */
export const CMUX_HOME = getCmuxHome();

/**
 * Directory where workspace git worktrees are stored.
 * Example: ~/.cmux/src/my-project/feature-branch
 */
export const CMUX_SRC_DIR = join(CMUX_HOME, "src");

/**
 * Directory where session chat histories are stored.
 * Example: ~/.cmux/sessions/workspace-id/chat.jsonl
 */
export const CMUX_SESSIONS_DIR = join(CMUX_HOME, "sessions");

/**
 * Main configuration file path.
 */
export const CMUX_CONFIG_FILE = join(CMUX_HOME, "config.json");

/**
 * Providers configuration file path.
 */
export const CMUX_PROVIDERS_FILE = join(CMUX_HOME, "providers.jsonc");

/**
 * Secrets file path.
 */
export const CMUX_SECRETS_FILE = join(CMUX_HOME, "secrets.json");

/**
 * Extension metadata file path (shared with VS Code extension).
 */
export const CMUX_EXTENSION_METADATA_FILE = join(CMUX_HOME, "extensionMetadata.json");

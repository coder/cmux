import type { ToolConfiguration } from "@/utils/tools/tools";

/**
 * Wait for workspace initialization to complete before executing tool.
 * Wraps InitStateManager.waitForInit() with consistent error handling.
 *
 * Returns null on success, or an error message string on failure.
 * The returned error message is ready to use in tool error results.
 */
export async function waitForWorkspaceInit(
  config: ToolConfiguration,
  operationName: string
): Promise<string | null> {
  try {
    await config.initStateManager.waitForInit(config.workspaceId);
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return `Cannot ${operationName}: ${errorMsg}`;
  }
}

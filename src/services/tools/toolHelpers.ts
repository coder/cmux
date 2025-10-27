import type { ToolConfiguration } from "@/utils/tools/tools";

/**
 * Wait for workspace initialization to complete before executing tool.
 * Wraps InitStateManager.waitForInit() for tool consistency.
 *
 * This is a no-op wrapper since waitForInit() never throws and always allows
 * tools to proceed. Kept for consistency and future extensibility.
 */
export async function waitForWorkspaceInit(config: ToolConfiguration): Promise<void> {
  await config.initStateManager.waitForInit(config.workspaceId);
}

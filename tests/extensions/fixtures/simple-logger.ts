/**
 * Simple logger extension for testing
 * Logs all tool executions to a file
 */

import type { Extension, PostToolUseHookPayload } from "@coder/cmux/ext";

const extension: Extension = {
  /**
   * Called after any tool is executed
   */
  async onPostToolUse(payload: PostToolUseHookPayload) {
    const { toolName, toolCallId, workspaceId, runtime } = payload;

    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      toolName,
      toolCallId,
      workspaceId,
    });

    // Use exec to write file (extensions don't have direct file write API)
    await runtime.exec(`mkdir -p .cmux && echo '${logEntry}' >> .cmux/extension-log.txt`, {
      cwd: ".",
      timeout: 5000,
    });
  },
};

export default extension;

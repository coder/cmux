/**
 * Simple logger extension for testing
 * Logs all tool executions to a file and returns result unmodified
 */

import type { Extension, PostToolUseHookPayload } from "@coder/cmux/ext";

const extension: Extension = {
  /**
   * Called after any tool is executed
   */
  async onPostToolUse(payload: PostToolUseHookPayload) {
    const { toolName, toolCallId, workspaceId, runtime, result } = payload;

    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      toolName,
      toolCallId,
      workspaceId,
    }) + "\n";

    // Use runtime.writeFile API (extensions have full Runtime access)
    await runtime.writeFile(".cmux/extension-log.txt", logEntry, {
      mode: "append",
    });
    
    // Return result unmodified
    return result;
  },
};

export default extension;

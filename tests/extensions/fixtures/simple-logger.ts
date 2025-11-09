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
    });

    // Use runtime.exec() for file operations
    await runtime.exec(
      `mkdir -p .cmux && echo ${JSON.stringify(logEntry)} >> .cmux/extension-log.txt`,
      { cwd: ".", timeout: 5 }
    );
    
    // Return result unmodified
    return result;
  },
};

export default extension;

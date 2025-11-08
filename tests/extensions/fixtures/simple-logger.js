/**
 * Simple logger extension for testing
 * Logs all tool executions to a file
 */

/** @typedef {import('../../../src/types/extensions').Extension} Extension */
/** @typedef {import('../../../src/types/extensions').PostToolUseContext} PostToolUseContext */

/** @type {Extension} */
const extension = {
  /**
   * Called after any tool is executed
   * @param {PostToolUseContext} context
   */
  async onPostToolUse(context) {
    const { toolName, toolCallId, workspaceId, runtime } = context;
    
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      toolName,
      toolCallId,
      workspaceId,
    }) + '\n';
    
    await runtime.writeFile('.cmux/extension-log.txt', logEntry, { append: true });
  },
};

export default extension;

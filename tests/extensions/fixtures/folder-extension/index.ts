/**
 * Folder-based extension for testing
 * Writes a marker file when any tool is used
 */

import type { Extension, PostToolUseHookPayload } from "@coder/cmux/ext";

const extension: Extension = {
  /**
   * Called after any tool is executed
   */
  async onPostToolUse(payload: PostToolUseHookPayload) {
    const { runtime, result } = payload;
    
    // Use runtime.exec() for file operations
    await runtime.exec(
      `mkdir -p .cmux && echo 'folder-based extension executed' > .cmux/folder-ext-ran.txt`,
      { cwd: ".", timeout: 5 }
    );
    
    // Return result unmodified
    return result;
  },
};

export default extension;

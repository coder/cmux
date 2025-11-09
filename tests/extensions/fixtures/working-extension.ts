/**
 * Working extension for error handling tests
 * Proves that one broken extension doesn't break others
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
      `mkdir -p .cmux && echo 'working extension executed' > .cmux/working-ext-ran.txt`,
      { cwd: ".", timeout: 5 }
    );
    
    // Return result unmodified
    return result;
  },
};

export default extension;

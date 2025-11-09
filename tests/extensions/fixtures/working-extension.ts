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
    
    // Use runtime.writeFile API
    await runtime.writeFile(
      ".cmux/working-ext-ran.txt",
      "working extension executed\n"
    );
    
    // Return result unmodified
    return result;
  },
};

export default extension;

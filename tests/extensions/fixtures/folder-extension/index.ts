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
    
    // Use runtime.writeFile API
    await runtime.writeFile(
      ".cmux/folder-ext-ran.txt",
      "folder-based extension executed\n"
    );
    
    // Return result unmodified
    return result;
  },
};

export default extension;

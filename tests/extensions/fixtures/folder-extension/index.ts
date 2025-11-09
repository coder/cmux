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
    const { runtime } = payload;
    // Use exec to write file (extensions don't have direct file write API)
    await runtime.exec(
      `mkdir -p .cmux && echo 'folder-based extension executed' > .cmux/folder-ext-ran.txt`,
      {
        cwd: ".",
        timeout: 5000,
      }
    );
  },
};

export default extension;

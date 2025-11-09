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
    const { runtime } = payload;
    // Use exec to write file (extensions don't have direct file write API)
    await runtime.exec(
      `mkdir -p .cmux && echo 'working extension executed' > .cmux/working-ext-ran.txt`,
      {
        cwd: ".",
        timeout: 5000,
      }
    );
  },
};

export default extension;

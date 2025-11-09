/**
 * Broken extension for error handling tests
 * Throws an error to test graceful degradation
 */

import type { Extension, PostToolUseHookPayload } from "@coder/cmux/ext";

const extension: Extension = {
  /**
   * Called after any tool is executed - intentionally throws
   */
  async onPostToolUse(payload: PostToolUseHookPayload) {
    throw new Error("Intentional test error");
  },
};

export default extension;

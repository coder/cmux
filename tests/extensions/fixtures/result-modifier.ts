/**
 * Extension that modifies bash command results
 * Demonstrates extension's ability to manipulate tool results
 */

import type { Extension, PostToolUseHookPayload } from "@coder/cmux/ext";

const extension: Extension = {
  async onPostToolUse(payload: PostToolUseHookPayload) {
    const { toolName, result } = payload;

    // Only modify bash results
    if (toolName === "bash") {
      // Add a marker to the output to prove modification works
      if (typeof result === "object" && result !== null && "output" in result) {
        return {
          ...result,
          output: (result as { output?: string }).output + "\n[Modified by extension]",
        };
      }
    }

    // Return result unmodified for other tools
    return result;
  },
};

export default extension;

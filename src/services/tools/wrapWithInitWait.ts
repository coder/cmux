import type { Tool } from "ai";
import type { ToolConfiguration } from "@/utils/tools/tools";

/**
 * Wraps a tool to wait for workspace initialization before execution.
 *
 * This wrapper handles the cross-cutting concern of init state waiting,
 * keeping individual tools simple and focused on their core functionality.
 *
 * Only runtime-dependent tools (bash, file_read, file_edit_*) need this wrapper.
 * Non-runtime tools (propose_plan, todo, web_search) execute immediately.
 *
 * @param tool The tool to wrap (returned from a tool factory)
 * @param config Tool configuration containing initStateManager
 * @returns Wrapped tool that waits for init before executing
 */
export function wrapWithInitWait<TParameters, TResult>(
  tool: Tool<TParameters, TResult>,
  config: ToolConfiguration
): Tool<TParameters, TResult> {
  return {
    ...tool,
    execute: async (args: TParameters, options) => {
      // Wait for workspace initialization to complete (no-op if not needed)
      // This never throws - tools proceed regardless of init outcome
      await config.initStateManager.waitForInit(config.workspaceId);

      // Execute the actual tool with all arguments
      if (!tool.execute) {
        throw new Error("Tool does not have an execute function");
      }
      return tool.execute(args, options);
    },
  } as Tool<TParameters, TResult>;
}

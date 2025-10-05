import type { Tool } from "ai";

/**
 * Filter for tool policy - determines if a tool should be enabled or disabled
 */
export interface ToolPolicyFilter {
  /** Regex pattern to match tool names (e.g., "bash", "file_edit_.*", ".*") */
  regex_match: string;
  /** Action to take when pattern matches */
  action: "enable" | "disable";
}

/**
 * Tool policy - array of filters applied in order
 * Default behavior is "allow" (all tools enabled) for backwards compatibility
 */
export type ToolPolicy = ToolPolicyFilter[];

/**
 * Apply tool policy to filter available tools
 * @param tools All available tools
 * @param policy Optional policy to apply (default: allow all)
 * @returns Filtered tools based on policy
 *
 * Algorithm:
 * 1. Start with default "allow" for all tools
 * 2. Apply each filter in order
 * 3. Last matching filter wins
 */
export function applyToolPolicy(
  tools: Record<string, Tool>,
  policy?: ToolPolicy
): Record<string, Tool> {
  // No policy = allow all (backwards compatible)
  if (!policy || policy.length === 0) {
    return tools;
  }

  // Build a map of tool name -> enabled status
  const toolStatus = new Map<string, boolean>();

  // Initialize all tools as enabled (default allow)
  for (const toolName of Object.keys(tools)) {
    toolStatus.set(toolName, true);
  }

  // Apply each filter in order
  for (const filter of policy) {
    const regex = new RegExp(`^${filter.regex_match}$`);
    const shouldEnable = filter.action === "enable";

    // Apply filter to matching tools
    for (const toolName of Object.keys(tools)) {
      if (regex.test(toolName)) {
        toolStatus.set(toolName, shouldEnable);
      }
    }
  }

  // Filter tools based on final status
  const filteredTools: Record<string, Tool> = {};
  for (const [toolName, tool] of Object.entries(tools)) {
    if (toolStatus.get(toolName) === true) {
      filteredTools[toolName] = tool;
    }
  }

  return filteredTools;
}

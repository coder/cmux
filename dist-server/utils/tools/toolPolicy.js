"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyToolPolicy = applyToolPolicy;
/**
 * Apply tool policy to filter available tools
 * @param tools All available tools
 * @param policy Optional policy to apply (default: allow all)
 * @returns Filtered tools based on policy
 *
 * Algorithm:
 * 1. Check if any tool is marked as "require"
 * 2. If a tool is required, disable all other tools (at most one can be required)
 * 3. Otherwise, start with default "allow" for all tools and apply filters in order
 * 4. Last matching filter wins
 */
function applyToolPolicy(tools, policy) {
    // No policy = allow all (backwards compatible)
    if (!policy || policy.length === 0) {
        return tools;
    }
    // First pass: find any required tools
    const requiredTools = new Set();
    for (const filter of policy) {
        if (filter.action === "require") {
            const regex = new RegExp(`^${filter.regex_match}$`);
            for (const toolName of Object.keys(tools)) {
                if (regex.test(toolName)) {
                    requiredTools.add(toolName);
                }
            }
        }
    }
    // Validate: at most one tool can be required
    if (requiredTools.size > 1) {
        throw new Error(`Tool policy error: Multiple tools marked as required (${Array.from(requiredTools).join(", ")}). At most one tool can be required.`);
    }
    // If a tool is required, return only that tool
    if (requiredTools.size === 1) {
        const requiredTool = Array.from(requiredTools)[0];
        return {
            [requiredTool]: tools[requiredTool],
        };
    }
    // No required tools: apply standard enable/disable logic
    // Build a map of tool name -> enabled status
    const toolStatus = new Map();
    // Initialize all tools as enabled (default allow)
    for (const toolName of Object.keys(tools)) {
        toolStatus.set(toolName, true);
    }
    // Apply each filter in order (skip "require" actions as they were handled above)
    for (const filter of policy) {
        if (filter.action === "require")
            continue;
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
    const filteredTools = {};
    for (const [toolName, tool] of Object.entries(tools)) {
        if (toolStatus.get(toolName) === true) {
            filteredTools[toolName] = tool;
        }
    }
    return filteredTools;
}
//# sourceMappingURL=toolPolicy.js.map
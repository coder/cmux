"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCompactSummaryTool = void 0;
const ai_1 = require("ai");
const toolDefinitions_1 = require("../../utils/tools/toolDefinitions");
/**
 * Compact summary tool factory for context compaction
 * Creates a tool that allows the AI to provide a conversation summary
 * @param config Required configuration (not used for this tool, but required by interface)
 */
const createCompactSummaryTool = () => {
    return (0, ai_1.tool)({
        description: toolDefinitions_1.TOOL_DEFINITIONS.compact_summary.description,
        inputSchema: toolDefinitions_1.TOOL_DEFINITIONS.compact_summary.schema,
        execute: ({ summary }) => {
            // Tool execution is a no-op on the backend
            // The summary is intercepted by the frontend and used to replace history
            return Promise.resolve({
                success: true,
                summary,
                message: "Summary generated successfully.",
            });
        },
    });
};
exports.createCompactSummaryTool = createCompactSummaryTool;
//# sourceMappingURL=compact_summary.js.map
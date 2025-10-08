"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProposePlanTool = void 0;
const ai_1 = require("ai");
const toolDefinitions_1 = require("../../utils/tools/toolDefinitions");
/**
 * Propose plan tool factory for AI assistant
 * Creates a tool that allows the AI to propose a plan for approval before execution
 * @param config Required configuration (not used for this tool, but required by interface)
 */
const createProposePlanTool = () => {
    return (0, ai_1.tool)({
        description: toolDefinitions_1.TOOL_DEFINITIONS.propose_plan.description,
        inputSchema: toolDefinitions_1.TOOL_DEFINITIONS.propose_plan.schema,
        execute: ({ title, plan }) => {
            // Tool execution is a no-op on the backend
            // The plan is displayed in the frontend and user decides whether to approve
            return Promise.resolve({
                success: true,
                title,
                plan,
                message: "Plan proposed. Waiting for user approval.",
            });
        },
    });
};
exports.createProposePlanTool = createProposePlanTool;
//# sourceMappingURL=propose_plan.js.map
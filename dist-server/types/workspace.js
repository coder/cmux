"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceMetadataSchema = void 0;
const zod_1 = require("zod");
/**
 * Zod schema for workspace metadata validation
 */
exports.WorkspaceMetadataSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, "Workspace ID is required"),
    projectName: zod_1.z.string().min(1, "Project name is required"),
    workspacePath: zod_1.z.string().min(1, "Workspace path is required"),
});
//# sourceMappingURL=workspace.js.map
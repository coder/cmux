"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileEditInsertTool = void 0;
const ai_1 = require("ai");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const write_file_atomic_1 = __importDefault(require("write-file-atomic"));
const toolDefinitions_1 = require("../../utils/tools/toolDefinitions");
const fileCommon_1 = require("./fileCommon");
/**
 * File edit insert tool factory for AI assistant
 * Creates a tool that allows the AI to insert content at a specific line position
 * @param config Required configuration including working directory
 */
const createFileEditInsertTool = (config) => {
    return (0, ai_1.tool)({
        description: toolDefinitions_1.TOOL_DEFINITIONS.file_edit_insert.description,
        inputSchema: toolDefinitions_1.TOOL_DEFINITIONS.file_edit_insert.schema,
        execute: async ({ file_path, line_offset, content, lease, }) => {
            try {
                // Validate that the path is within the working directory
                const pathValidation = (0, fileCommon_1.validatePathInCwd)(file_path, config.cwd);
                if (pathValidation) {
                    return {
                        success: false,
                        error: pathValidation.error,
                    };
                }
                // Resolve path (but expect absolute paths)
                const resolvedPath = path.isAbsolute(file_path)
                    ? file_path
                    : path.resolve(config.cwd, file_path);
                // Check if file exists
                const stats = await fs.stat(resolvedPath);
                if (!stats.isFile()) {
                    return {
                        success: false,
                        error: `Path exists but is not a file: ${resolvedPath}`,
                    };
                }
                // Validate lease to prevent editing stale file state
                const currentLease = (0, fileCommon_1.leaseFromStat)(stats);
                if (currentLease !== lease) {
                    return {
                        success: false,
                        error: `WRITE DENIED: File lease mismatch. The file has been modified since it was read. Please read the file again.`,
                    };
                }
                // Read file content
                const originalContent = await fs.readFile(resolvedPath, { encoding: "utf-8" });
                const lines = originalContent.split("\n");
                // Validate line_offset
                if (line_offset < 0) {
                    return {
                        success: false,
                        error: `line_offset must be non-negative (got ${line_offset})`,
                    };
                }
                if (line_offset > lines.length) {
                    return {
                        success: false,
                        error: `line_offset ${line_offset} is beyond file length (${lines.length} lines)`,
                    };
                }
                // Insert content at specified line
                // line_offset = 0: insert at top (before line 1)
                // line_offset = N: insert after line N
                const newLines = [...lines.slice(0, line_offset), content, ...lines.slice(line_offset)];
                const newContent = newLines.join("\n");
                // Write the modified content back to file atomically
                await (0, write_file_atomic_1.default)(resolvedPath, newContent, { encoding: "utf-8" });
                // Get new file stats and compute new lease
                const newStats = await fs.stat(resolvedPath);
                const newLease = (0, fileCommon_1.leaseFromStat)(newStats);
                // Generate diff
                const diff = (0, fileCommon_1.generateDiff)(resolvedPath, originalContent, newContent);
                return {
                    success: true,
                    lease: newLease,
                    diff,
                };
            }
            catch (error) {
                // Handle specific errors
                if (error && typeof error === "object" && "code" in error) {
                    if (error.code === "ENOENT") {
                        return {
                            success: false,
                            error: `File not found: ${file_path}`,
                        };
                    }
                    else if (error.code === "EACCES") {
                        return {
                            success: false,
                            error: `Permission denied: ${file_path}`,
                        };
                    }
                }
                // Generic error
                const message = error instanceof Error ? error.message : String(error);
                return {
                    success: false,
                    error: `Failed to insert content: ${message}`,
                };
            }
        },
    });
};
exports.createFileEditInsertTool = createFileEditInsertTool;
//# sourceMappingURL=file_edit_insert.js.map
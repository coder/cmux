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
Object.defineProperty(exports, "__esModule", { value: true });
exports.leaseFromStat = leaseFromStat;
exports.generateDiff = generateDiff;
exports.validatePathInCwd = validatePathInCwd;
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const diff_1 = require("diff");
/**
 * Compute a 6-character hexadecimal lease from file stats.
 * The lease changes when file is modified (mtime or size changes).
 * Uses a deterministic hash so leases are consistent across processes.
 *
 * @param stats - File stats from fs.stat()
 * @returns 6-character hexadecimal lease string
 */
function leaseFromStat(stats) {
    // Use highest-precision timestamp available
    const mtime = stats.mtimeMs ?? stats.mtime.getTime();
    // We use size in case mtime is only second precision, which occurs on some
    // dated filesystems.
    const data = `${mtime}:${stats.size}`;
    // Use deterministic SHA-256 hash (no secret) so leases are consistent
    // across processes and restarts
    return crypto.createHash("sha256").update(data).digest("hex").slice(0, 6);
}
/**
 * Generate a unified diff between old and new content using jsdiff.
 * Uses createPatch with context of 3 lines.
 *
 * @param filePath - The file path being edited (used in diff header)
 * @param oldContent - The original file content
 * @param newContent - The modified file content
 * @returns Unified diff string
 */
function generateDiff(filePath, oldContent, newContent) {
    return (0, diff_1.createPatch)(filePath, oldContent, newContent, "", "", { context: 3 });
}
/**
 * Validates that a file path is within the allowed working directory.
 * Returns an error object if the path is outside cwd, null if valid.
 *
 * @param filePath - The file path to validate (can be relative or absolute)
 * @param cwd - The working directory that file operations are restricted to
 * @returns Error object if invalid, null if valid
 */
function validatePathInCwd(filePath, cwd) {
    // Resolve the path (handles relative paths and normalizes)
    const resolvedPath = path.isAbsolute(filePath)
        ? path.resolve(filePath)
        : path.resolve(cwd, filePath);
    const resolvedCwd = path.resolve(cwd);
    // Check if resolved path starts with cwd (accounting for trailing slashes)
    // Use path.relative to check if we need to go "up" from cwd to reach the file
    const relativePath = path.relative(resolvedCwd, resolvedPath);
    // If the relative path starts with '..' or is empty, the file is outside cwd
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return {
            error: `File operations are restricted to the workspace directory (${cwd}). The path '${filePath}' resolves outside this directory. If you need to modify files outside the workspace, please ask the user for permission first.`,
        };
    }
    return null;
}
//# sourceMappingURL=fileCommon.js.map
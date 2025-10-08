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
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileReadTool = void 0;
const ai_1 = require("ai");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const toolDefinitions_1 = require("../../utils/tools/toolDefinitions");
const fileCommon_1 = require("./fileCommon");
/**
 * File read tool factory for AI assistant
 * Creates a tool that allows the AI to read file contents from the file system
 * @param config Required configuration including working directory
 */
const createFileReadTool = (config) => {
    return (0, ai_1.tool)({
        description: toolDefinitions_1.TOOL_DEFINITIONS.file_read.description,
        inputSchema: toolDefinitions_1.TOOL_DEFINITIONS.file_read.schema,
        execute: async ({ filePath, offset, limit }, { abortSignal: _abortSignal }) => {
            // Note: abortSignal available but not used - file reads are fast and complete quickly
            try {
                const env_1 = { stack: [], error: void 0, hasError: false };
                try {
                    // Validate that the path is within the working directory
                    const pathValidation = (0, fileCommon_1.validatePathInCwd)(filePath, config.cwd);
                    if (pathValidation) {
                        return {
                            success: false,
                            error: pathValidation.error,
                        };
                    }
                    // Resolve relative paths from configured working directory
                    const resolvedPath = path.isAbsolute(filePath)
                        ? filePath
                        : path.resolve(config.cwd, filePath);
                    // Check if file exists
                    const stats = await fs.stat(resolvedPath);
                    if (!stats.isFile()) {
                        return {
                            success: false,
                            error: `Path exists but is not a file: ${resolvedPath}`,
                        };
                    }
                    // Compute lease for this file state
                    const lease = (0, fileCommon_1.leaseFromStat)(stats);
                    const startLineNumber = offset ?? 1;
                    // Validate offset
                    if (offset !== undefined && offset < 1) {
                        return {
                            success: false,
                            error: `Offset must be positive (got ${offset})`,
                        };
                    }
                    // Open file with using for automatic cleanup
                    const fileHandle = __addDisposableResource(env_1, await fs.open(resolvedPath, "r"), true);
                    // Create readline interface for line-by-line reading
                    const rl = readline.createInterface({
                        input: fileHandle.createReadStream({ encoding: "utf-8" }),
                        crlfDelay: Infinity,
                    });
                    const numberedLines = [];
                    let currentLineNumber = 1;
                    let totalLinesRead = 0;
                    let totalBytesAccumulated = 0;
                    const MAX_LINE_BYTES = 1024;
                    const MAX_LINES = 1000;
                    const MAX_TOTAL_BYTES = 16 * 1024; // 16KB
                    // Iterate through file line by line
                    for await (const line of rl) {
                        // Skip lines before offset
                        if (currentLineNumber < startLineNumber) {
                            currentLineNumber++;
                            continue;
                        }
                        // Truncate line if it exceeds max bytes
                        let processedLine = line;
                        const lineBytes = Buffer.byteLength(line, "utf-8");
                        if (lineBytes > MAX_LINE_BYTES) {
                            // Truncate to MAX_LINE_BYTES
                            processedLine = Buffer.from(line, "utf-8")
                                .subarray(0, MAX_LINE_BYTES)
                                .toString("utf-8");
                            processedLine += "... [truncated]";
                        }
                        // Format line with number prefix
                        const numberedLine = `${currentLineNumber}\t${processedLine}`;
                        const numberedLineBytes = Buffer.byteLength(numberedLine, "utf-8");
                        // Check if adding this line would exceed byte limit
                        if (totalBytesAccumulated + numberedLineBytes > MAX_TOTAL_BYTES) {
                            return {
                                success: false,
                                error: `Output would exceed ${MAX_TOTAL_BYTES} bytes. Please read less at a time using offset and limit parameters.`,
                            };
                        }
                        numberedLines.push(numberedLine);
                        totalBytesAccumulated += numberedLineBytes + 1; // +1 for newline
                        totalLinesRead++;
                        currentLineNumber++;
                        // Check if we've exceeded max lines
                        if (totalLinesRead > MAX_LINES) {
                            return {
                                success: false,
                                error: `Output would exceed ${MAX_LINES} lines. Please read less at a time using offset and limit parameters.`,
                            };
                        }
                        // Stop if we've collected enough lines
                        if (limit !== undefined && totalLinesRead >= limit) {
                            break;
                        }
                    }
                    // Check if offset was beyond file length
                    if (offset !== undefined && numberedLines.length === 0) {
                        return {
                            success: false,
                            error: `Offset ${offset} is beyond file length`,
                        };
                    }
                    // Join lines with newlines
                    const content = numberedLines.join("\n");
                    // Return file info and content
                    // IMPORTANT: lease must be last in the return object so it remains fresh in the LLM's context
                    // when it's reading this tool result. The LLM needs the lease value to perform subsequent edits.
                    return {
                        success: true,
                        file_size: stats.size,
                        modifiedTime: stats.mtime.toISOString(),
                        lines_read: numberedLines.length,
                        content,
                        lease, // Must be last - see comment above
                    };
                }
                catch (e_1) {
                    env_1.error = e_1;
                    env_1.hasError = true;
                }
                finally {
                    const result_1 = __disposeResources(env_1);
                    if (result_1)
                        await result_1;
                }
            }
            catch (error) {
                // Handle specific errors
                if (error && typeof error === "object" && "code" in error) {
                    if (error.code === "ENOENT") {
                        return {
                            success: false,
                            error: `File not found: ${filePath}`,
                        };
                    }
                    else if (error.code === "EACCES") {
                        return {
                            success: false,
                            error: `Permission denied: ${filePath}`,
                        };
                    }
                }
                // Generic error
                const message = error instanceof Error ? error.message : String(error);
                return {
                    success: false,
                    error: `Failed to read file: ${message}`,
                };
            }
        },
    });
};
exports.createFileReadTool = createFileReadTool;
//# sourceMappingURL=file_read.js.map
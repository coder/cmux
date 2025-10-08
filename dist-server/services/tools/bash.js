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
exports.createBashTool = void 0;
const ai_1 = require("ai");
const child_process_1 = require("child_process");
const readline_1 = require("readline");
const path = __importStar(require("path"));
const toolLimits_1 = require("../../constants/toolLimits");
const toolDefinitions_1 = require("../../utils/tools/toolDefinitions");
/**
 * Wraps a ChildProcess to make it disposable for use with `using` statements
 */
class DisposableProcess {
    process;
    constructor(process) {
        this.process = process;
    }
    [Symbol.dispose]() {
        if (!this.process.killed) {
            this.process.kill();
        }
    }
    get child() {
        return this.process;
    }
}
/**
 * Bash execution tool factory for AI assistant
 * Creates a bash tool that can execute commands with a configurable timeout
 * @param config Required configuration including working directory
 */
const createBashTool = (config) => {
    return (0, ai_1.tool)({
        description: toolDefinitions_1.TOOL_DEFINITIONS.bash.description + "\nRuns in " + config.cwd + " - no cd needed",
        inputSchema: toolDefinitions_1.TOOL_DEFINITIONS.bash.schema,
        execute: async ({ script, timeout_secs, max_lines = toolLimits_1.BASH_DEFAULT_MAX_LINES, stdin }, { abortSignal }) => {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const startTime = performance.now();
                const normalizedMaxLines = Math.max(1, Math.floor(max_lines));
                const effectiveMaxLines = Math.min(normalizedMaxLines, toolLimits_1.BASH_HARD_MAX_LINES);
                // Detect redundant cd to working directory
                // Match patterns like: "cd /path &&", "cd /path;", "cd '/path' &&", "cd \"/path\" &&"
                const cdPattern = /^\s*cd\s+['"]?([^'";&|]+)['"]?\s*[;&|]/;
                const match = cdPattern.exec(script);
                if (match) {
                    const targetPath = match[1].trim();
                    // Normalize paths for comparison (resolve to absolute)
                    const normalizedTarget = path.resolve(config.cwd, targetPath);
                    const normalizedCwd = path.resolve(config.cwd);
                    if (normalizedTarget === normalizedCwd) {
                        return {
                            success: false,
                            error: `Redundant cd to working directory detected. The tool already runs in ${config.cwd} - no cd needed. Remove the 'cd ${targetPath}' prefix.`,
                            exitCode: -1,
                            wall_duration_ms: 0,
                        };
                    }
                }
                // Create the process with `using` for automatic cleanup
                const childProcess = __addDisposableResource(env_1, new DisposableProcess((0, child_process_1.spawn)("bash", ["-c", script], {
                    cwd: config.cwd,
                    env: {
                        ...process.env,
                        // Prevent interactive editors from blocking bash execution
                        // This is critical for git operations like rebase/commit that try to open editors
                        GIT_EDITOR: "true", // Git-specific editor (highest priority)
                        GIT_SEQUENCE_EDITOR: "true", // For interactive rebase sequences
                        EDITOR: "true", // General fallback for non-git commands
                        VISUAL: "true", // Another common editor environment variable
                    },
                    stdio: [stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"], // stdin: pipe if provided, else ignore
                })), false);
                // Write stdin if provided
                if (stdin !== undefined && childProcess.child.stdin) {
                    childProcess.child.stdin.write(stdin);
                    childProcess.child.stdin.end();
                }
                // Use a promise to wait for completion
                return await new Promise((resolve) => {
                    const lines = [];
                    let truncated = false;
                    let exitCode = null;
                    let resolved = false;
                    // Helper to resolve once
                    const resolveOnce = (result) => {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeoutHandle);
                            // Clean up abort listener if present
                            if (abortSignal && abortListener) {
                                abortSignal.removeEventListener("abort", abortListener);
                            }
                            resolve(result);
                        }
                    };
                    // Set up abort signal listener - kill process when stream is cancelled
                    let abortListener = null;
                    if (abortSignal) {
                        abortListener = () => {
                            if (!resolved) {
                                childProcess.child.kill();
                                // The close event will fire and handle finalization with abort error
                            }
                        };
                        abortSignal.addEventListener("abort", abortListener);
                    }
                    // Set up timeout - kill process and let close event handle cleanup
                    const timeoutHandle = setTimeout(() => {
                        if (!resolved) {
                            childProcess.child.kill();
                            // The close event will fire and handle finalization with timeout error
                        }
                    }, timeout_secs * 1000);
                    // Set up readline for both stdout and stderr to handle line buffering
                    const stdoutReader = (0, readline_1.createInterface)({ input: childProcess.child.stdout });
                    const stderrReader = (0, readline_1.createInterface)({ input: childProcess.child.stderr });
                    stdoutReader.on("line", (line) => {
                        if (!truncated && !resolved) {
                            lines.push(line);
                            // Check if we've exceeded the effective max_lines limit
                            if (lines.length >= effectiveMaxLines) {
                                truncated = true;
                                // Close readline interfaces before killing to ensure clean shutdown
                                stdoutReader.close();
                                stderrReader.close();
                                childProcess.child.kill();
                            }
                        }
                    });
                    stderrReader.on("line", (line) => {
                        if (!truncated && !resolved) {
                            lines.push(line);
                            // Check if we've exceeded the effective max_lines limit
                            if (lines.length >= effectiveMaxLines) {
                                truncated = true;
                                // Close readline interfaces before killing to ensure clean shutdown
                                stdoutReader.close();
                                stderrReader.close();
                                childProcess.child.kill();
                            }
                        }
                    });
                    // Track when streams end
                    stdoutReader.on("close", () => {
                        stdoutEnded = true;
                        tryFinalize();
                    });
                    stderrReader.on("close", () => {
                        stderrEnded = true;
                        tryFinalize();
                    });
                    // Use 'exit' event instead of 'close' to handle background processes correctly.
                    // The 'close' event waits for ALL child processes (including background ones) to exit,
                    // which causes hangs when users spawn background processes like servers.
                    // The 'exit' event fires when the main bash process exits, which is what we want.
                    let stdoutEnded = false;
                    let stderrEnded = false;
                    let processExited = false;
                    const handleExit = (code) => {
                        processExited = true;
                        exitCode = code;
                        // Try to finalize immediately if streams have ended
                        tryFinalize();
                        // Set a grace period timer - if streams don't end within 50ms, finalize anyway
                        // This handles background processes that keep stdio open
                        setTimeout(() => {
                            if (!resolved && processExited) {
                                // Forcibly destroy streams to ensure they close
                                childProcess.child.stdout?.destroy();
                                childProcess.child.stderr?.destroy();
                                stdoutEnded = true;
                                stderrEnded = true;
                                finalize();
                            }
                        }, 50);
                    };
                    const tryFinalize = () => {
                        if (resolved)
                            return;
                        // Finalize if process exited AND (both streams ended OR 100ms grace period passed)
                        if (!processExited)
                            return;
                        // If we've already collected output, finalize immediately
                        // Otherwise wait a bit for streams to flush
                        if (stdoutEnded && stderrEnded) {
                            finalize();
                        }
                    };
                    const finalize = () => {
                        if (resolved)
                            return;
                        // Round to integer to preserve tokens.
                        const wall_duration_ms = Math.round(performance.now() - startTime);
                        // Clean up readline interfaces if still open
                        stdoutReader.close();
                        stderrReader.close();
                        // Join lines and add truncation marker if needed
                        let output = lines.join("\n");
                        if (truncated && output.length > 0) {
                            output += " [TRUNCATED]";
                        }
                        // Check if this was aborted (stream cancelled)
                        const wasAborted = abortSignal?.aborted ?? false;
                        // Check if this was a timeout (process killed and no natural exit code)
                        const timedOut = !wasAborted && wall_duration_ms >= timeout_secs * 1000 - 10; // 10ms tolerance
                        if (wasAborted) {
                            resolveOnce({
                                success: false,
                                error: "Command aborted due to stream cancellation",
                                exitCode: -2,
                                wall_duration_ms,
                                truncated,
                            });
                        }
                        else if (timedOut) {
                            resolveOnce({
                                success: false,
                                error: `Command timed out after ${timeout_secs} seconds`,
                                exitCode: -1,
                                wall_duration_ms,
                                truncated,
                            });
                        }
                        else if (exitCode === 0 || exitCode === null) {
                            resolveOnce({
                                success: true,
                                output,
                                exitCode: 0,
                                wall_duration_ms,
                                ...(truncated && { truncated: true }),
                            });
                        }
                        else {
                            resolveOnce({
                                success: false,
                                output,
                                exitCode,
                                error: `Command exited with code ${exitCode}`,
                                wall_duration_ms,
                                truncated,
                            });
                        }
                    };
                    // Listen to exit event (fires when bash exits, before streams close)
                    childProcess.child.on("exit", handleExit);
                    childProcess.child.on("error", (err) => {
                        if (resolved)
                            return;
                        const wall_duration_ms = performance.now() - startTime;
                        resolveOnce({
                            success: false,
                            error: `Failed to execute command: ${err.message}`,
                            exitCode: -1,
                            wall_duration_ms,
                        });
                    });
                });
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        },
    });
};
exports.createBashTool = createBashTool;
//# sourceMappingURL=bash.js.map
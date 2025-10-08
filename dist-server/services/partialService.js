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
exports.PartialService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const result_1 = require("../types/result");
const workspaceFileLocks_1 = require("../utils/concurrency/workspaceFileLocks");
/**
 * PartialService - Manages partial message persistence for interrupted streams
 *
 * Responsibilities:
 * - Read/write/delete partial.json for all workspaces
 * - Commit partial messages to history when appropriate
 * - Encapsulate partial message lifecycle logic
 * - Synchronize file operations per workspace using MutexMap
 *
 * Separation of Concerns:
 * - PartialService owns partial.json
 * - HistoryService owns chat.jsonl
 * - StreamManager only interacts with PartialService
 * - AIService orchestrates both services
 *
 * This is a singleton service that manages partials for all workspaces.
 */
class PartialService {
    PARTIAL_FILE = "partial.json";
    historyService;
    // Shared file operation lock across all workspace file services
    // This prevents deadlocks when services call each other (e.g., PartialService → HistoryService)
    fileLocks = workspaceFileLocks_1.workspaceFileLocks;
    config;
    constructor(config, historyService) {
        this.config = config;
        this.historyService = historyService;
    }
    getPartialPath(workspaceId) {
        return path.join(this.config.getSessionDir(workspaceId), this.PARTIAL_FILE);
    }
    /**
     * Read the partial message for a workspace, if it exists
     */
    async readPartial(workspaceId) {
        try {
            const partialPath = this.getPartialPath(workspaceId);
            const data = await fs.readFile(partialPath, "utf-8");
            return JSON.parse(data);
        }
        catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
                return null; // No partial exists
            }
            // Log other errors but don't fail
            console.error("Error reading partial:", error);
            return null;
        }
    }
    /**
     * Write a partial message to disk (with file locking per workspace)
     */
    async writePartial(workspaceId, message) {
        return this.fileLocks.withLock(workspaceId, async () => {
            try {
                const workspaceDir = this.config.getSessionDir(workspaceId);
                await fs.mkdir(workspaceDir, { recursive: true });
                const partialPath = this.getPartialPath(workspaceId);
                // Ensure message has partial flag
                const partialMessage = {
                    ...message,
                    metadata: {
                        ...message.metadata,
                        partial: true,
                    },
                };
                await fs.writeFile(partialPath, JSON.stringify(partialMessage, null, 2));
                return (0, result_1.Ok)(undefined);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return (0, result_1.Err)(`Failed to write partial: ${message}`);
            }
        });
    }
    /**
     * Delete the partial message file for a workspace (with file locking)
     */
    async deletePartial(workspaceId) {
        return this.fileLocks.withLock(workspaceId, async () => {
            try {
                const partialPath = this.getPartialPath(workspaceId);
                await fs.unlink(partialPath);
                return (0, result_1.Ok)(undefined);
            }
            catch (error) {
                if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
                    return (0, result_1.Ok)(undefined); // Already deleted
                }
                const message = error instanceof Error ? error.message : String(error);
                return (0, result_1.Err)(`Failed to delete partial: ${message}`);
            }
        });
    }
    /**
     * Commit any existing partial message to chat.jsonl and delete partial.json.
     * This is idempotent - if the partial has already been finalized in history,
     * it won't be committed again (preventing double-commits).
     * After committing (or if already finalized), partial.json is deleted.
     *
     * Smart commit logic:
     * - If no message with this sequence exists in history: APPEND
     * - If message exists but partial has more parts: UPDATE in place
     * - Otherwise: skip commit (already finalized)
     */
    async commitToHistory(workspaceId) {
        try {
            const partial = await this.readPartial(workspaceId);
            if (!partial) {
                return (0, result_1.Ok)(undefined); // No partial to commit
            }
            // Don't commit errored partials to chat.jsonl
            // Errored messages are transient failures, not committed history
            // This prevents error accumulation when editing messages multiple times
            if (partial.metadata?.error) {
                return await this.deletePartial(workspaceId);
            }
            const partialSeq = partial.metadata?.historySequence;
            if (partialSeq === undefined) {
                return (0, result_1.Err)("Partial message has no historySequence");
            }
            // Check if this partial has already been finalized in chat.jsonl
            // A partial with MORE parts than what's in history means it's newer and should be committed
            // (placeholder has empty parts, interrupted stream has accumulated parts)
            const historyResult = await this.historyService.getHistory(workspaceId);
            if (!historyResult.success) {
                return (0, result_1.Err)(`Failed to read history: ${historyResult.error}`);
            }
            const existingMessages = historyResult.data;
            const existingMessage = existingMessages.find((msg) => msg.metadata?.historySequence === partialSeq);
            const shouldCommit = !existingMessage || // No message with this sequence yet
                (partial.parts?.length ?? 0) > (existingMessage.parts?.length ?? 0); // Partial has more parts
            if (shouldCommit) {
                if (existingMessage) {
                    // Message exists (placeholder) - UPDATE it in place to avoid duplicates
                    const updateResult = await this.historyService.updateHistory(workspaceId, partial);
                    if (!updateResult.success) {
                        return updateResult;
                    }
                }
                else {
                    // No message with this sequence - APPEND to history
                    const appendResult = await this.historyService.appendToHistory(workspaceId, partial);
                    if (!appendResult.success) {
                        return appendResult;
                    }
                }
            }
            // Delete partial.json after successful commit (or if already finalized)
            return await this.deletePartial(workspaceId);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return (0, result_1.Err)(`Failed to commit partial: ${message}`);
        }
    }
}
exports.PartialService = PartialService;
//# sourceMappingURL=partialService.js.map
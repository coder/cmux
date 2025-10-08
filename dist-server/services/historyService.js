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
exports.HistoryService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const result_1 = require("../types/result");
const workspaceFileLocks_1 = require("../utils/concurrency/workspaceFileLocks");
const log_1 = require("./log");
const tokenizer_1 = require("../utils/tokens/tokenizer");
/**
 * HistoryService - Manages chat history persistence and sequence numbering
 *
 * Responsibilities:
 * - Read/write chat history to disk (JSONL format)
 * - Assign sequence numbers to messages (single source of truth)
 * - Track next sequence number per workspace
 */
class HistoryService {
    CHAT_FILE = "chat.jsonl";
    // Track next sequence number per workspace in memory
    sequenceCounters = new Map();
    // Shared file operation lock across all workspace file services
    // This prevents deadlocks when services call each other (e.g., PartialService → HistoryService)
    fileLocks = workspaceFileLocks_1.workspaceFileLocks;
    config;
    constructor(config) {
        this.config = config;
    }
    getChatHistoryPath(workspaceId) {
        return path.join(this.config.getSessionDir(workspaceId), this.CHAT_FILE);
    }
    /**
     * Read raw messages from chat.jsonl (does not include partial.json)
     * Returns empty array if file doesn't exist
     * Skips malformed JSON lines to prevent data loss from corruption
     */
    async readChatHistory(workspaceId) {
        try {
            const chatHistoryPath = this.getChatHistoryPath(workspaceId);
            const data = await fs.readFile(chatHistoryPath, "utf-8");
            const lines = data.split("\n").filter((line) => line.trim());
            const messages = [];
            for (let i = 0; i < lines.length; i++) {
                try {
                    const message = JSON.parse(lines[i]);
                    messages.push(message);
                }
                catch (parseError) {
                    // Skip malformed lines but log error for debugging
                    console.error(`[HistoryService] Skipping malformed JSON at line ${i + 1} in ${workspaceId}/chat.jsonl:`, parseError instanceof Error ? parseError.message : String(parseError), "\nLine content:", lines[i].substring(0, 100) + (lines[i].length > 100 ? "..." : ""));
                }
            }
            return messages;
        }
        catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
                return []; // No history yet
            }
            throw error; // Re-throw non-ENOENT errors
        }
    }
    async getHistory(workspaceId) {
        try {
            // Read chat history from disk
            // Note: partial.json is NOT merged here - it's managed by PartialService
            const messages = await this.readChatHistory(workspaceId);
            return (0, result_1.Ok)(messages);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return (0, result_1.Err)(`Failed to read history: ${message}`);
        }
    }
    /**
     * Get or initialize the next history sequence number for a workspace
     */
    async getNextHistorySequence(workspaceId) {
        // Check if we already have it in memory
        if (this.sequenceCounters.has(workspaceId)) {
            return this.sequenceCounters.get(workspaceId);
        }
        // Initialize from history
        const historyResult = await this.getHistory(workspaceId);
        if (historyResult.success) {
            const messages = historyResult.data;
            // Find max history sequence number
            let maxSeqNum = -1;
            for (const msg of messages) {
                const seqNum = msg.metadata?.historySequence;
                if (seqNum !== undefined && seqNum > maxSeqNum) {
                    maxSeqNum = seqNum;
                }
            }
            const nextSeqNum = maxSeqNum + 1;
            this.sequenceCounters.set(workspaceId, nextSeqNum);
            return nextSeqNum;
        }
        // No history yet, start from 0
        this.sequenceCounters.set(workspaceId, 0);
        return 0;
    }
    /**
     * Internal helper for appending to history without acquiring lock
     * Used by both appendToHistory and commitPartial to avoid deadlock
     */
    async _appendToHistoryUnlocked(workspaceId, message) {
        try {
            const workspaceDir = this.config.getSessionDir(workspaceId);
            await fs.mkdir(workspaceDir, { recursive: true });
            const historyPath = this.getChatHistoryPath(workspaceId);
            // DEBUG: Log message append with caller stack trace
            const stack = new Error().stack?.split("\n").slice(2, 6).join("\n") ?? "no stack";
            log_1.log.debug(`[HISTORY APPEND] workspaceId=${workspaceId} role=${message.role} id=${message.id}`);
            log_1.log.debug(`[HISTORY APPEND] Call stack:\n${stack}`);
            // Ensure message has a history sequence number
            if (!message.metadata) {
                // Create metadata with history sequence
                const nextSeqNum = await this.getNextHistorySequence(workspaceId);
                message.metadata = {
                    historySequence: nextSeqNum,
                };
                this.sequenceCounters.set(workspaceId, nextSeqNum + 1);
            }
            else {
                // Message already has metadata, but may need historySequence assigned
                const existingSeqNum = message.metadata.historySequence;
                if (existingSeqNum !== undefined) {
                    // Already has history sequence, update counter if needed
                    const currentCounter = this.sequenceCounters.get(workspaceId) ?? 0;
                    if (existingSeqNum >= currentCounter) {
                        this.sequenceCounters.set(workspaceId, existingSeqNum + 1);
                    }
                }
                else {
                    // Has metadata but no historySequence, assign one
                    const nextSeqNum = await this.getNextHistorySequence(workspaceId);
                    message.metadata = {
                        ...message.metadata,
                        historySequence: nextSeqNum,
                    };
                    this.sequenceCounters.set(workspaceId, nextSeqNum + 1);
                }
            }
            // Store the message with workspace context
            const historyEntry = {
                ...message,
                workspaceId,
            };
            // DEBUG: Log assigned sequence number
            log_1.log.debug(`[HISTORY APPEND] Assigned historySequence=${message.metadata.historySequence} role=${message.role}`);
            await fs.appendFile(historyPath, JSON.stringify(historyEntry) + "\n");
            return (0, result_1.Ok)(undefined);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return (0, result_1.Err)(`Failed to append to history: ${message}`);
        }
    }
    async appendToHistory(workspaceId, message) {
        return this.fileLocks.withLock(workspaceId, async () => {
            return this._appendToHistoryUnlocked(workspaceId, message);
        });
    }
    /**
     * Update an existing message in history by historySequence
     * Reads entire history, replaces the matching message, and rewrites the file
     */
    async updateHistory(workspaceId, message) {
        return this.fileLocks.withLock(workspaceId, async () => {
            try {
                const historyPath = this.getChatHistoryPath(workspaceId);
                // Read all messages
                const historyResult = await this.getHistory(workspaceId);
                if (!historyResult.success) {
                    return historyResult; // Return the error
                }
                const messages = historyResult.data;
                const targetSequence = message.metadata?.historySequence;
                if (targetSequence === undefined) {
                    return (0, result_1.Err)("Cannot update message without historySequence");
                }
                // Find and replace the message with matching historySequence
                let found = false;
                for (let i = 0; i < messages.length; i++) {
                    if (messages[i].metadata?.historySequence === targetSequence) {
                        // Preserve the historySequence, update everything else
                        messages[i] = {
                            ...message,
                            metadata: {
                                ...message.metadata,
                                historySequence: targetSequence,
                            },
                        };
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    return (0, result_1.Err)(`No message found with historySequence ${targetSequence}`);
                }
                // Rewrite entire file
                const historyEntries = messages
                    .map((msg) => JSON.stringify({ ...msg, workspaceId }) + "\n")
                    .join("");
                await fs.writeFile(historyPath, historyEntries);
                return (0, result_1.Ok)(undefined);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return (0, result_1.Err)(`Failed to update history: ${message}`);
            }
        });
    }
    /**
     * Truncate history after a specific message ID
     * Removes the message with the given ID and all subsequent messages
     */
    async truncateAfterMessage(workspaceId, messageId) {
        return this.fileLocks.withLock(workspaceId, async () => {
            try {
                const historyResult = await this.getHistory(workspaceId);
                if (!historyResult.success) {
                    return historyResult;
                }
                const messages = historyResult.data;
                const messageIndex = messages.findIndex((msg) => msg.id === messageId);
                if (messageIndex === -1) {
                    return (0, result_1.Err)(`Message with ID ${messageId} not found in history`);
                }
                // Keep only messages before the target message
                const truncatedMessages = messages.slice(0, messageIndex);
                // Rewrite the history file with truncated messages
                const historyPath = this.getChatHistoryPath(workspaceId);
                const historyEntries = truncatedMessages
                    .map((msg) => JSON.stringify({ ...msg, workspaceId }) + "\n")
                    .join("");
                await fs.writeFile(historyPath, historyEntries);
                // Update sequence counter to continue from where we truncated
                if (truncatedMessages.length > 0) {
                    const lastMsg = truncatedMessages[truncatedMessages.length - 1];
                    const lastSeq = lastMsg.metadata?.historySequence ?? 0;
                    this.sequenceCounters.set(workspaceId, lastSeq + 1);
                }
                else {
                    this.sequenceCounters.set(workspaceId, 0);
                }
                return (0, result_1.Ok)(undefined);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return (0, result_1.Err)(`Failed to truncate history: ${message}`);
            }
        });
    }
    /**
     * Truncate history by removing approximately the given percentage of tokens from the beginning
     * @param workspaceId The workspace ID
     * @param percentage Percentage to truncate (0.0 to 1.0). 1.0 = delete all
     * @returns Result containing array of deleted historySequence numbers
     */
    async truncateHistory(workspaceId, percentage) {
        return this.fileLocks.withLock(workspaceId, async () => {
            try {
                const historyPath = this.getChatHistoryPath(workspaceId);
                // Fast path: 100% truncation = delete entire file
                if (percentage >= 1.0) {
                    const historyResult = await this.getHistory(workspaceId);
                    const deletedSequences = historyResult.success
                        ? historyResult.data
                            .map((msg) => msg.metadata?.historySequence ?? -1)
                            .filter((s) => s >= 0)
                        : [];
                    try {
                        await fs.unlink(historyPath);
                    }
                    catch (error) {
                        // Ignore ENOENT - file already deleted
                        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
                            throw error;
                        }
                    }
                    // Reset sequence counter when clearing history
                    this.sequenceCounters.set(workspaceId, 0);
                    return (0, result_1.Ok)(deletedSequences);
                }
                // Read all messages
                const historyResult = await this.getHistory(workspaceId);
                if (!historyResult.success) {
                    return (0, result_1.Err)(historyResult.error);
                }
                const messages = historyResult.data;
                if (messages.length === 0) {
                    return (0, result_1.Ok)([]); // Nothing to truncate
                }
                // Get tokenizer for counting (use a default model)
                const tokenizer = (0, tokenizer_1.getTokenizerForModel)("anthropic:claude-sonnet-4-5");
                // Count tokens for each message
                // We stringify the entire message for simplicity - only relative weights matter
                const messageTokens = messages.map((msg) => {
                    const tokens = tokenizer.countTokens(JSON.stringify(msg));
                    return { message: msg, tokens };
                });
                // Calculate total tokens and target to remove
                const totalTokens = messageTokens.reduce((sum, mt) => sum + mt.tokens, 0);
                const tokensToRemove = Math.floor(totalTokens * percentage);
                // Remove messages from beginning until we've removed enough tokens
                let tokensRemoved = 0;
                let removeCount = 0;
                for (const mt of messageTokens) {
                    if (tokensRemoved >= tokensToRemove) {
                        break;
                    }
                    tokensRemoved += mt.tokens;
                    removeCount++;
                }
                // If we're removing all messages, use fast path
                if (removeCount >= messages.length) {
                    try {
                        await fs.unlink(historyPath);
                    }
                    catch (error) {
                        // Ignore ENOENT
                        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
                            throw error;
                        }
                    }
                    this.sequenceCounters.set(workspaceId, 0);
                    const deletedSequences = messages
                        .map((msg) => msg.metadata?.historySequence ?? -1)
                        .filter((s) => s >= 0);
                    return (0, result_1.Ok)(deletedSequences);
                }
                // Keep messages after removeCount
                const remainingMessages = messages.slice(removeCount);
                const deletedMessages = messages.slice(0, removeCount);
                const deletedSequences = deletedMessages
                    .map((msg) => msg.metadata?.historySequence ?? -1)
                    .filter((s) => s >= 0);
                // Rewrite the history file with remaining messages
                const historyEntries = remainingMessages
                    .map((msg) => JSON.stringify({ ...msg, workspaceId }) + "\n")
                    .join("");
                await fs.writeFile(historyPath, historyEntries);
                // Update sequence counter to continue from where we are
                if (remainingMessages.length > 0) {
                    const lastMsg = remainingMessages[remainingMessages.length - 1];
                    const lastSeq = lastMsg.metadata?.historySequence ?? 0;
                    this.sequenceCounters.set(workspaceId, lastSeq + 1);
                }
                else {
                    this.sequenceCounters.set(workspaceId, 0);
                }
                return (0, result_1.Ok)(deletedSequences);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return (0, result_1.Err)(`Failed to truncate history: ${message}`);
            }
        });
    }
    async clearHistory(workspaceId) {
        const result = await this.truncateHistory(workspaceId, 1.0);
        if (!result.success) {
            return (0, result_1.Err)(result.error);
        }
        return (0, result_1.Ok)(undefined);
    }
    /**
     * Migrate all messages in chat.jsonl to use a new workspace ID
     * This is used during workspace rename to update the workspaceId field in all historical messages
     * IMPORTANT: Should be called AFTER the session directory has been renamed
     */
    async migrateWorkspaceId(oldWorkspaceId, newWorkspaceId) {
        return this.fileLocks.withLock(newWorkspaceId, async () => {
            try {
                // Read messages from the NEW workspace location (directory was already renamed)
                const historyResult = await this.getHistory(newWorkspaceId);
                if (!historyResult.success) {
                    return historyResult;
                }
                const messages = historyResult.data;
                if (messages.length === 0) {
                    // No messages to migrate, just transfer sequence counter
                    const oldCounter = this.sequenceCounters.get(oldWorkspaceId) ?? 0;
                    this.sequenceCounters.set(newWorkspaceId, oldCounter);
                    this.sequenceCounters.delete(oldWorkspaceId);
                    return (0, result_1.Ok)(undefined);
                }
                // Rewrite all messages with new workspace ID
                const newHistoryPath = this.getChatHistoryPath(newWorkspaceId);
                const historyEntries = messages
                    .map((msg) => JSON.stringify({ ...msg, workspaceId: newWorkspaceId }) + "\n")
                    .join("");
                await fs.writeFile(newHistoryPath, historyEntries);
                // Transfer sequence counter to new workspace ID
                const oldCounter = this.sequenceCounters.get(oldWorkspaceId) ?? 0;
                this.sequenceCounters.set(newWorkspaceId, oldCounter);
                this.sequenceCounters.delete(oldWorkspaceId);
                log_1.log.debug(`Migrated ${messages.length} messages from ${oldWorkspaceId} to ${newWorkspaceId}`);
                return (0, result_1.Ok)(undefined);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return (0, result_1.Err)(`Failed to migrate workspace ID: ${message}`);
            }
        });
    }
}
exports.HistoryService = HistoryService;
//# sourceMappingURL=historyService.js.map
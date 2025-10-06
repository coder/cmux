import * as fs from "fs/promises";
import * as path from "path";
import type { Result } from "@/types/result";
import { Ok, Err } from "@/types/result";
import type { CmuxMessage } from "@/types/message";
import type { Config } from "@/config";
import type { TruncationTarget } from "@/types/ipc";
import { workspaceFileLocks } from "@/utils/concurrency/workspaceFileLocks";
import { log } from "./log";
import { getTokenizerForModel } from "@/utils/tokens/tokenizer";

/**
 * HistoryService - Manages chat history persistence and sequence numbering
 *
 * Responsibilities:
 * - Read/write chat history to disk (JSONL format)
 * - Assign sequence numbers to messages (single source of truth)
 * - Track next sequence number per workspace
 */
export class HistoryService {
  private readonly CHAT_FILE = "chat.jsonl";
  // Track next sequence number per workspace in memory
  private sequenceCounters = new Map<string, number>();
  // Shared file operation lock across all workspace file services
  // This prevents deadlocks when services call each other (e.g., PartialService → HistoryService)
  private readonly fileLocks = workspaceFileLocks;
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private getChatHistoryPath(workspaceId: string): string {
    return path.join(this.config.getSessionDir(workspaceId), this.CHAT_FILE);
  }

  /**
   * Read raw messages from chat.jsonl (does not include partial.json)
   * Returns empty array if file doesn't exist
   * Skips malformed JSON lines to prevent data loss from corruption
   */
  private async readChatHistory(workspaceId: string): Promise<CmuxMessage[]> {
    try {
      const chatHistoryPath = this.getChatHistoryPath(workspaceId);
      const data = await fs.readFile(chatHistoryPath, "utf-8");
      const lines = data.split("\n").filter((line) => line.trim());
      const messages: CmuxMessage[] = [];

      for (let i = 0; i < lines.length; i++) {
        try {
          const message = JSON.parse(lines[i]) as CmuxMessage;
          messages.push(message);
        } catch (parseError) {
          // Skip malformed lines but log error for debugging
          console.error(
            `[HistoryService] Skipping malformed JSON at line ${i + 1} in ${workspaceId}/chat.jsonl:`,
            parseError instanceof Error ? parseError.message : String(parseError),
            "\nLine content:",
            lines[i].substring(0, 100) + (lines[i].length > 100 ? "..." : "")
          );
        }
      }

      return messages;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return []; // No history yet
      }
      throw error; // Re-throw non-ENOENT errors
    }
  }

  async getHistory(workspaceId: string): Promise<Result<CmuxMessage[]>> {
    try {
      // Read chat history from disk
      // Note: partial.json is NOT merged here - it's managed by PartialService
      const messages = await this.readChatHistory(workspaceId);
      return Ok(messages);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to read history: ${message}`);
    }
  }

  /**
   * Get or initialize the next history sequence number for a workspace
   */
  private async getNextHistorySequence(workspaceId: string): Promise<number> {
    // Check if we already have it in memory
    if (this.sequenceCounters.has(workspaceId)) {
      return this.sequenceCounters.get(workspaceId)!;
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
  private async _appendToHistoryUnlocked(
    workspaceId: string,
    message: CmuxMessage
  ): Promise<Result<void>> {
    try {
      const workspaceDir = this.config.getSessionDir(workspaceId);
      await fs.mkdir(workspaceDir, { recursive: true });
      const historyPath = this.getChatHistoryPath(workspaceId);

      // DEBUG: Log message append with caller stack trace
      const stack = new Error().stack?.split("\n").slice(2, 6).join("\n") ?? "no stack";
      log.debug(
        `[HISTORY APPEND] workspaceId=${workspaceId} role=${message.role} id=${message.id}`
      );
      log.debug(`[HISTORY APPEND] Call stack:\n${stack}`);

      // Ensure message has a history sequence number
      if (!message.metadata) {
        // Create metadata with history sequence
        const nextSeqNum = await this.getNextHistorySequence(workspaceId);
        message.metadata = {
          historySequence: nextSeqNum,
        };
        this.sequenceCounters.set(workspaceId, nextSeqNum + 1);
      } else {
        // Message already has metadata, but may need historySequence assigned
        const existingSeqNum = message.metadata.historySequence;
        if (existingSeqNum !== undefined) {
          // Already has history sequence, update counter if needed
          const currentCounter = this.sequenceCounters.get(workspaceId) ?? 0;
          if (existingSeqNum >= currentCounter) {
            this.sequenceCounters.set(workspaceId, existingSeqNum + 1);
          }
        } else {
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
      log.debug(
        `[HISTORY APPEND] Assigned historySequence=${message.metadata.historySequence} role=${message.role}`
      );

      await fs.appendFile(historyPath, JSON.stringify(historyEntry) + "\n");
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to append to history: ${message}`);
    }
  }

  async appendToHistory(workspaceId: string, message: CmuxMessage): Promise<Result<void>> {
    return this.fileLocks.withLock(workspaceId, async () => {
      return this._appendToHistoryUnlocked(workspaceId, message);
    });
  }

  /**
   * Update an existing message in history by historySequence
   * Reads entire history, replaces the matching message, and rewrites the file
   */
  async updateHistory(workspaceId: string, message: CmuxMessage): Promise<Result<void>> {
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
          return Err("Cannot update message without historySequence");
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
          return Err(`No message found with historySequence ${targetSequence}`);
        }

        // Rewrite entire file
        const historyEntries = messages
          .map((msg) => JSON.stringify({ ...msg, workspaceId }) + "\n")
          .join("");

        await fs.writeFile(historyPath, historyEntries);
        return Ok(undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err(`Failed to update history: ${message}`);
      }
    });
  }

  /**
   * Truncate history after a specific message ID
   * Removes the message with the given ID and all subsequent messages
   */
  async truncateAfterMessage(workspaceId: string, messageId: string): Promise<Result<void>> {
    return this.fileLocks.withLock(workspaceId, async () => {
      try {
        const historyResult = await this.getHistory(workspaceId);
        if (!historyResult.success) {
          return historyResult;
        }

        const messages = historyResult.data;
        const messageIndex = messages.findIndex((msg) => msg.id === messageId);

        if (messageIndex === -1) {
          return Err(`Message with ID ${messageId} not found in history`);
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
        } else {
          this.sequenceCounters.set(workspaceId, 0);
        }

        return Ok(undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err(`Failed to truncate history: ${message}`);
      }
    });
  }

  /**
   * Truncate history based on target specification
   * @param workspaceId The workspace ID
   * @param target Either percentage-based (by token count) or sequence-based (up to a historySequence)
   * @returns Result containing array of deleted historySequence numbers
   */
  async truncateHistory(
    workspaceId: string,
    target: TruncationTarget
  ): Promise<Result<number[], string>> {
    return this.fileLocks.withLock(workspaceId, async () => {
      try {
        const historyPath = this.getChatHistoryPath(workspaceId);

        // Read all messages
        const historyResult = await this.getHistory(workspaceId);
        if (!historyResult.success) {
          return Err(historyResult.error);
        }

        const messages = historyResult.data;
        if (messages.length === 0) {
          return Ok([]); // Nothing to truncate
        }

        let removeCount = 0;

        if (target.type === "percentage") {
          // Percentage-based truncation: remove by token count
          const percentage = target.value;

          // Fast path: 100% truncation = delete all
          if (percentage >= 1.0) {
            removeCount = messages.length;
          } else {
            // Get tokenizer for counting (use a default model)
            const tokenizer = getTokenizerForModel("anthropic:claude-sonnet-4-5");

            // Count tokens for each message
            const messageTokens: Array<{ message: CmuxMessage; tokens: number }> = messages.map(
              (msg) => {
                const tokens = tokenizer.countTokens(JSON.stringify(msg));
                return { message: msg, tokens };
              }
            );

            // Calculate total tokens and target to remove
            const totalTokens = messageTokens.reduce((sum, mt) => sum + mt.tokens, 0);
            const tokensToRemove = Math.floor(totalTokens * percentage);

            // Remove messages from beginning until we've removed enough tokens
            let tokensRemoved = 0;
            for (const mt of messageTokens) {
              if (tokensRemoved >= tokensToRemove) {
                break;
              }
              tokensRemoved += mt.tokens;
              removeCount++;
            }
          }
        } else {
          // Sequence-based truncation: remove all messages with historySequence < target
          const targetSequence = target.historySequence;
          console.log(
            `[historyService] truncateHistory upTo sequence ${targetSequence}, total messages:`,
            messages.length
          );

          // Log all message sequences for debugging
          const sequences = messages.map((msg, idx) => ({
            index: idx,
            id: msg.id,
            role: msg.role,
            historySequence: msg.metadata?.historySequence,
          }));
          console.log("[historyService] Message sequences:", sequences);

          // Validate that target message exists and has valid historySequence
          const targetIndex = messages.findIndex(
            (msg) => msg.metadata?.historySequence === targetSequence
          );

          console.log(`[historyService] Target found at index:`, targetIndex);

          if (targetIndex === -1) {
            return Err(
              `Cannot truncate: no message found with historySequence ${targetSequence}. ` +
                `This may indicate history contains messages without sequence numbers. ` +
                `Try using percentage-based truncation instead.`
            );
          }

          // Remove all messages before the target (keep target and after)
          removeCount = targetIndex;
          console.log(`[historyService] Will remove ${removeCount} messages before target`);
        }

        // If we're removing all messages, use fast path
        if (removeCount >= messages.length) {
          const deletedSequences = messages
            .map((msg) => msg.metadata?.historySequence ?? -1)
            .filter((s) => s >= 0);

          try {
            await fs.unlink(historyPath);
          } catch (error) {
            // Ignore ENOENT
            if (
              !(error && typeof error === "object" && "code" in error && error.code === "ENOENT")
            ) {
              throw error;
            }
          }

          this.sequenceCounters.set(workspaceId, 0);
          return Ok(deletedSequences);
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
        } else {
          this.sequenceCounters.set(workspaceId, 0);
        }

        return Ok(deletedSequences);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err(`Failed to truncate history: ${message}`);
      }
    });
  }

  async clearHistory(workspaceId: string): Promise<Result<void>> {
    const result = await this.truncateHistory(workspaceId, { type: "percentage", value: 1.0 });
    if (!result.success) {
      return Err(result.error);
    }
    return Ok(undefined);
  }

  /**
   * Migrate all messages in chat.jsonl to use a new workspace ID
   * This is used during workspace rename to update the workspaceId field in all historical messages
   * IMPORTANT: Should be called AFTER the session directory has been renamed
   */
  async migrateWorkspaceId(oldWorkspaceId: string, newWorkspaceId: string): Promise<Result<void>> {
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
          return Ok(undefined);
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

        log.debug(
          `Migrated ${messages.length} messages from ${oldWorkspaceId} to ${newWorkspaceId}`
        );

        return Ok(undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err(`Failed to migrate workspace ID: ${message}`);
      }
    });
  }
}

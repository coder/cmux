import * as fs from "fs/promises";
import * as path from "path";
import type { Result } from "../types/result";
import { Ok, Err } from "../types/result";
import type { CmuxMessage } from "../types/message";
import type { Config } from "../config";
import { MutexMap } from "../utils/mutexMap";
import { log } from "./log";

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
  // File operation locks per workspace to prevent race conditions
  private fileLocks = new MutexMap<string>();
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

  async clearHistory(workspaceId: string): Promise<Result<void>> {
    return this.fileLocks.withLock(workspaceId, async () => {
      try {
        const historyPath = this.getChatHistoryPath(workspaceId);
        await fs.unlink(historyPath);
        // Reset sequence counter when clearing history
        this.sequenceCounters.set(workspaceId, 0);
        // Note: partial.json is now managed by PartialService
        return Ok(undefined);
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          // Already cleared, reset counter anyway
          this.sequenceCounters.set(workspaceId, 0);
          return Ok(undefined);
        }
        const message = error instanceof Error ? error.message : String(error);
        return Err(`Failed to clear history: ${message}`);
      }
    });
  }
}

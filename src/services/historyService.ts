import * as fs from "fs/promises";
import * as path from "path";
import { Result, Ok, Err } from "../types/result";
import { CmuxMessage } from "../types/message";
import { getSessionDir } from "../config";

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

  private getChatHistoryPath(workspaceId: string): string {
    return path.join(getSessionDir(workspaceId), this.CHAT_FILE);
  }

  async getHistory(workspaceId: string): Promise<Result<CmuxMessage[]>> {
    try {
      const historyPath = this.getChatHistoryPath(workspaceId);
      const data = await fs.readFile(historyPath, "utf-8");
      const messages = data
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as CmuxMessage);
      return Ok(messages);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return Ok([]); // No history yet
      }
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

  async appendToHistory(workspaceId: string, message: CmuxMessage): Promise<Result<void>> {
    try {
      const workspaceDir = getSessionDir(workspaceId);
      await fs.mkdir(workspaceDir, { recursive: true });
      const historyPath = this.getChatHistoryPath(workspaceId);

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

      await fs.appendFile(historyPath, JSON.stringify(historyEntry) + "\n");
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(`Failed to append to history: ${message}`);
    }
  }

  async clearHistory(workspaceId: string): Promise<Result<void>> {
    try {
      const historyPath = this.getChatHistoryPath(workspaceId);
      await fs.unlink(historyPath);
      // Reset sequence counter when clearing history
      this.sequenceCounters.set(workspaceId, 0);
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
  }
}

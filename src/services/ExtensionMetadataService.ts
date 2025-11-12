import { dirname } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import {
  type ExtensionMetadata,
  type ExtensionMetadataFile,
  getExtensionMetadataPath,
} from "@/utils/extensionMetadata";

/**
 * Service for managing workspace metadata used by VS Code extension integration.
 * 
 * This service tracks:
 * - recency: Unix timestamp (ms) of last user interaction
 * - streaming: Boolean indicating if workspace has an active stream
 * - lastModel: Last model used in this workspace
 * 
 * File location: ~/.cmux/extensionMetadata.json
 * 
 * Uses atomic writes to prevent corruption. Read-heavy workload (extension reads,
 * main app writes on user interactions).
 */

export interface WorkspaceMetadata extends ExtensionMetadata {
  workspaceId: string;
  updatedAt: number;
}

export class ExtensionMetadataService {
  private readonly filePath: string;
  private data: ExtensionMetadataFile;

  private constructor(filePath: string, data: ExtensionMetadataFile) {
    this.filePath = filePath;
    this.data = data;
  }

  /**
   * Create a new ExtensionMetadataService instance.
   * Use this static factory method instead of the constructor.
   */
  static async create(filePath?: string): Promise<ExtensionMetadataService> {
    const path = filePath ?? getExtensionMetadataPath();

    // Ensure directory exists
    const dir = dirname(path);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Load existing data or initialize
    const data = await ExtensionMetadataService.loadData(path);

    const service = new ExtensionMetadataService(path, data);

    // Clear stale streaming flags (from crashes)
    await service.clearStaleStreaming();

    return service;
  }

  private static async loadData(filePath: string): Promise<ExtensionMetadataFile> {
    if (!existsSync(filePath)) {
      return { version: 1, workspaces: {} };
    }

    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as ExtensionMetadataFile;

      // Validate structure
      if (typeof parsed !== "object" || parsed.version !== 1) {
        console.error(
          "[ExtensionMetadataService] Invalid metadata file, resetting"
        );
        return { version: 1, workspaces: {} };
      }

      return parsed;
    } catch (error) {
      console.error("[ExtensionMetadataService] Failed to load metadata:", error);
      return { version: 1, workspaces: {} };
    }
  }

  private async save(): Promise<void> {
    try {
      const content = JSON.stringify(this.data, null, 2);
      await writeFile(this.filePath, content, "utf-8");
    } catch (error) {
      console.error("[ExtensionMetadataService] Failed to save metadata:", error);
    }
  }

  /**
   * Update the recency timestamp for a workspace.
   * Call this on user messages or other interactions.
   */
  async updateRecency(workspaceId: string, timestamp: number = Date.now()): Promise<void> {
    if (!this.data.workspaces[workspaceId]) {
      this.data.workspaces[workspaceId] = {
        recency: timestamp,
        streaming: false,
        lastModel: null,
      };
    } else {
      this.data.workspaces[workspaceId].recency = timestamp;
    }
    await this.save();
  }

  /**
   * Set the streaming status for a workspace.
   * Call this when streams start/end.
   */
  async setStreaming(workspaceId: string, streaming: boolean, model?: string): Promise<void> {
    const now = Date.now();
    if (!this.data.workspaces[workspaceId]) {
      this.data.workspaces[workspaceId] = {
        recency: now,
        streaming,
        lastModel: model ?? null,
      };
    } else {
      this.data.workspaces[workspaceId].streaming = streaming;
      if (model) {
        this.data.workspaces[workspaceId].lastModel = model;
      }
    }
    await this.save();
  }

  /**
   * Get metadata for a single workspace.
   */
  getMetadata(workspaceId: string): WorkspaceMetadata | null {
    const entry = this.data.workspaces[workspaceId];
    if (!entry) return null;

    return {
      workspaceId,
      updatedAt: entry.recency, // Use recency as updatedAt for backwards compatibility
      ...entry,
    };
  }

  /**
   * Get all workspace metadata, ordered by recency.
   * Used by VS Code extension to sort workspace list.
   */
  getAllMetadata(): Map<string, WorkspaceMetadata> {
    const map = new Map<string, WorkspaceMetadata>();

    // Convert to array, sort by recency, then create map
    const entries = Object.entries(this.data.workspaces);
    entries.sort((a, b) => b[1].recency - a[1].recency);

    for (const [workspaceId, entry] of entries) {
      map.set(workspaceId, {
        workspaceId,
        updatedAt: entry.recency, // Use recency as updatedAt for backwards compatibility
        ...entry,
      });
    }

    return map;
  }

  /**
   * Delete metadata for a workspace.
   * Call this when a workspace is deleted.
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    if (this.data.workspaces[workspaceId]) {
      delete this.data.workspaces[workspaceId];
      await this.save();
    }
  }

  /**
   * Clear all streaming flags.
   * Call this on app startup to clean up stale streaming states from crashes.
   */
  async clearStaleStreaming(): Promise<void> {
    let modified = false;
    for (const entry of Object.values(this.data.workspaces)) {
      if (entry.streaming) {
        entry.streaming = false;
        modified = true;
      }
    }
    if (modified) {
      await this.save();
    }
  }
}

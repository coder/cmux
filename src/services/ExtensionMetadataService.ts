import { dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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

  constructor(filePath?: string) {
    this.filePath = filePath ?? getExtensionMetadataPath();

    // Ensure directory exists
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Load existing data or initialize
    this.data = this.load();

    // Clear stale streaming flags (from crashes)
    this.clearStaleStreaming();
  }

  private load(): ExtensionMetadataFile {
    if (!existsSync(this.filePath)) {
      return { version: 1, workspaces: {} };
    }

    try {
      const content = readFileSync(this.filePath, "utf-8");
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

  private save() {
    try {
      const content = JSON.stringify(this.data, null, 2);
      // Simple synchronous write - atomic enough for our use case
      // VS Code extension only reads, never writes concurrently
      writeFileSync(this.filePath, content, "utf-8");
    } catch (error) {
      console.error("[ExtensionMetadataService] Failed to save metadata:", error);
    }
  }

  /**
   * Update the recency timestamp for a workspace.
   * Call this on user messages or other interactions.
   */
  updateRecency(workspaceId: string, timestamp: number = Date.now()) {
    if (!this.data.workspaces[workspaceId]) {
      this.data.workspaces[workspaceId] = {
        recency: timestamp,
        streaming: false,
        lastModel: null,
      };
    } else {
      this.data.workspaces[workspaceId].recency = timestamp;
    }
    this.save();
  }

  /**
   * Set the streaming status for a workspace.
   * Call this when streams start/end.
   */
  setStreaming(workspaceId: string, streaming: boolean, model?: string) {
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
    this.save();
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
  deleteWorkspace(workspaceId: string) {
    if (this.data.workspaces[workspaceId]) {
      delete this.data.workspaces[workspaceId];
      this.save();
    }
  }

  /**
   * Clear all streaming flags.
   * Call this on app startup to clean up stale streaming states from crashes.
   */
  clearStaleStreaming() {
    let modified = false;
    for (const entry of Object.values(this.data.workspaces)) {
      if (entry.streaming) {
        entry.streaming = false;
        modified = true;
      }
    }
    if (modified) {
      this.save();
    }
  }
}

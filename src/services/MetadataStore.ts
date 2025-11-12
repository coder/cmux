import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

/**
 * Workspace metadata stored in SQLite database.
 *
 * EXPERIMENTAL: This metadata store is currently used for VS Code extension integration
 * to provide recency-based sorting and streaming status indicators. In the future, we may
 * migrate all configuration (config.json) to this database for better performance and
 * queryability.
 *
 * Current schema:
 * - recency: Unix timestamp (ms) of last user interaction
 * - streaming: Boolean indicating if workspace has an active stream
 * - lastModel: Last model used in this workspace
 *
 * Performance characteristics:
 * - WAL mode enabled: readers never block writers
 * - Sub-millisecond updates (in-memory with async checkpoint)
 * - Scales to 1000+ workspaces
 *
 * File location: ~/.cmux/metadata.db
 */

export interface WorkspaceMetadata {
  workspaceId: string;
  recency: number;
  streaming: boolean;
  lastModel: string | null;
  updatedAt: number;
}

export class MetadataStore {
  private readonly db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? join(homedir(), ".cmux", "metadata.db");

    // Ensure directory exists
    const dir = join(homedir(), ".cmux");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(path);

    // Enable WAL mode for concurrent reads (readers never block writers)
    this.db.pragma("journal_mode = WAL");

    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_metadata (
        workspace_id TEXT PRIMARY KEY,
        recency INTEGER NOT NULL,
        streaming INTEGER NOT NULL DEFAULT 0,
        last_model TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recency 
        ON workspace_metadata(recency DESC);
    `);
  }

  /**
   * Update the recency timestamp for a workspace.
   * Call this on user messages or other interactions.
   */
  updateRecency(workspaceId: string, timestamp: number = Date.now()) {
    const stmt = this.db.prepare(`
      INSERT INTO workspace_metadata (workspace_id, recency, streaming, updated_at)
      VALUES (?, ?, 0, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        recency = excluded.recency,
        updated_at = excluded.updated_at
    `);
    stmt.run(workspaceId, timestamp, timestamp);
  }

  /**
   * Set the streaming status for a workspace.
   * Call this when streams start/end.
   */
  setStreaming(workspaceId: string, streaming: boolean, model?: string) {
    const stmt = this.db.prepare(`
      INSERT INTO workspace_metadata (workspace_id, recency, streaming, last_model, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        streaming = excluded.streaming,
        last_model = COALESCE(excluded.last_model, last_model),
        updated_at = excluded.updated_at
    `);
    const now = Date.now();
    stmt.run(workspaceId, now, streaming ? 1 : 0, model ?? null, now);
  }

  /**
   * Get metadata for a single workspace.
   */
  getMetadata(workspaceId: string): WorkspaceMetadata | null {
    const stmt = this.db.prepare(`
      SELECT * FROM workspace_metadata WHERE workspace_id = ?
    `);
    const row = stmt.get(workspaceId) as
      | {
          workspace_id: string;
          recency: number;
          streaming: number;
          last_model: string | null;
          updated_at: number;
        }
      | undefined;
    if (!row) return null;

    return {
      workspaceId: row.workspace_id,
      recency: row.recency,
      streaming: row.streaming === 1,
      lastModel: row.last_model,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all workspace metadata, ordered by recency.
   * Used by VS Code extension to sort workspace list.
   */
  getAllMetadata(): Map<string, WorkspaceMetadata> {
    const stmt = this.db.prepare(`
      SELECT * FROM workspace_metadata ORDER BY recency DESC
    `);
    const rows = stmt.all() as Array<{
      workspace_id: string;
      recency: number;
      streaming: number;
      last_model: string | null;
      updated_at: number;
    }>;
    const map = new Map<string, WorkspaceMetadata>();
    for (const row of rows) {
      map.set(row.workspace_id, {
        workspaceId: row.workspace_id,
        recency: row.recency,
        streaming: row.streaming === 1,
        lastModel: row.last_model,
        updatedAt: row.updated_at,
      });
    }
    return map;
  }

  /**
   * Delete metadata for a workspace.
   * Call this when a workspace is deleted.
   */
  deleteWorkspace(workspaceId: string) {
    const stmt = this.db.prepare(`
      DELETE FROM workspace_metadata WHERE workspace_id = ?
    `);
    stmt.run(workspaceId);
  }

  /**
   * Clear all streaming flags.
   * Call this on app startup to clean up stale streaming states from crashes.
   */
  clearStaleStreaming() {
    const stmt = this.db.prepare(`
      UPDATE workspace_metadata SET streaming = 0 WHERE streaming = 1
    `);
    stmt.run();
  }

  /**
   * Close the database connection.
   * Call this on app shutdown.
   */
  close() {
    this.db.close();
  }
}

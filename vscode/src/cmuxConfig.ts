import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import Database from "better-sqlite3";

/**
 * Extension metadata from SQLite database
 */
export interface ExtensionMetadata {
  recency: number;
  streaming: boolean;
  lastModel: string | null;
}

// Row shape from metadata.db
interface MetadataRow {
  workspace_id: string;
  recency: number;
  streaming: number; // 0/1
  last_model: string | null;
}

/**
 * Runtime configuration for workspace execution environments
 */
export type RuntimeConfig =
  | {
      type: "local";
      srcBaseDir: string;
    }
  | {
      type: "ssh";
      host: string;
      srcBaseDir: string;
      identityFile?: string;
      port?: number;
    };

/**
 * Workspace metadata from cmux config
 */
export interface WorkspaceMetadata {
  id: string;
  name: string;
  projectName: string;
  projectPath: string;
  createdAt?: string;
  runtimeConfig?: RuntimeConfig;
}

/**
 * Project configuration from cmux
 */
export interface ProjectConfig {
  path: string;
  workspaces: WorkspaceMetadata[];
}

/**
 * Full cmux configuration structure
 */
export interface CmuxConfig {
  projects: Array<[string, ProjectConfig]>;
}

/**
 * Workspace with additional context for display
 */
export interface WorkspaceWithContext extends WorkspaceMetadata {
  projectPath: string;
  extensionMetadata?: ExtensionMetadata;
}

/**
 * Read and parse the cmux configuration file
 */
export function readCmuxConfig(): CmuxConfig | null {
  const configPath = path.join(os.homedir(), ".cmux", "config.json");

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const configData = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(configData) as CmuxConfig;
  } catch (error) {
    console.error("Failed to read cmux config:", error);
    return null;
  }
}

/**
 * Read workspace metadata from SQLite database.
 * This provides recency and streaming status for sorting and display.
 */
function readMetadataStore(): Map<string, ExtensionMetadata> {
  const dbPath = path.join(os.homedir(), ".cmux", "metadata.db");

  // Check if DB exists
  if (!fs.existsSync(dbPath)) {
    return new Map();
  }

  try {
    const db = new Database(dbPath, { readonly: true });
    const stmt = db.prepare(`
      SELECT workspace_id, recency, streaming, last_model
      FROM workspace_metadata
      ORDER BY recency DESC
    `);

    const rows = stmt.all() as MetadataRow[];
    const map = new Map<string, ExtensionMetadata>();

    for (const row of rows) {
      map.set(row.workspace_id, {
        recency: row.recency,
        streaming: row.streaming === 1,
        lastModel: row.last_model,
      });
    }

    db.close();
    return map;
  } catch (error) {
    console.error("Failed to read metadata store:", error);
    return new Map();
  }
}

/**
 * Get all workspaces from the cmux configuration
 */
export function getAllWorkspaces(): WorkspaceWithContext[] {
  const config = readCmuxConfig();
  if (!config) {
    return [];
  }

  const metadata = readMetadataStore();
  const workspaces: WorkspaceWithContext[] = [];

  for (const [projectPath, projectConfig] of config.projects) {
    const projectName = path.basename(projectPath);

    for (const workspace of projectConfig.workspaces) {
      const meta = metadata.get(workspace.id);

      workspaces.push({
        ...workspace,
        // Ensure projectName is set (use from workspace or derive from path)
        projectName: workspace.projectName || projectName,
        projectPath,
        extensionMetadata: meta,
      });
    }
  }

  // Sort by recency (metadata recency > createdAt > name)

  const recencyOf = (w: WorkspaceWithContext): number =>
    w.extensionMetadata?.recency ?? (w.createdAt ? Date.parse(w.createdAt) : 0);
  workspaces.sort((a, b) => {
    const aRecency = recencyOf(a);
    const bRecency = recencyOf(b);
    if (aRecency !== bRecency) return bRecency - aRecency;
    return a.name.localeCompare(b.name);
  });

  return workspaces;
}

/**
 * Get the workspace path for a local workspace
 * This follows the same logic as cmux's Config.getWorkspacePath
 */
export function getWorkspacePath(
  projectPath: string,
  workspaceName: string
): string {
  const projectName = path.basename(projectPath);
  const srcBaseDir = path.join(os.homedir(), ".cmux", "src");
  return path.join(srcBaseDir, projectName, workspaceName);
}

/**
 * Get the workspace path for an SSH workspace
 */
export function getRemoteWorkspacePath(
  workspace: WorkspaceWithContext
): string {
  if (!workspace.runtimeConfig || workspace.runtimeConfig.type !== "ssh") {
    throw new Error("Not an SSH workspace");
  }

  const projectName = path.basename(workspace.projectPath);
  const srcBaseDir = workspace.runtimeConfig.srcBaseDir;

  // Remote paths should be absolute (starting with / or ~)
  const basePath =
    srcBaseDir.startsWith("/") || srcBaseDir.startsWith("~")
      ? srcBaseDir
      : `/${srcBaseDir}`;

  return `${basePath}/${projectName}/${workspace.name}`;
}

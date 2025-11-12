import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { RuntimeConfig, WorkspaceMetadata } from "./shared/types";

/**
 * Extension metadata from JSON file
 */
export interface ExtensionMetadata {
  recency: number;
  streaming: boolean;
  lastModel: string | null;
}

// File structure for extensionMetadata.json
interface ExtensionMetadataFile {
  version: 1;
  workspaces: Record<string, ExtensionMetadata>;
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
 * Read workspace metadata from JSON file.
 * This provides recency and streaming status for sorting and display.
 */
function readExtensionMetadata(): Map<string, ExtensionMetadata> {
  const metadataPath = path.join(os.homedir(), ".cmux", "extensionMetadata.json");

  // Check if file exists
  if (!fs.existsSync(metadataPath)) {
    return new Map();
  }

  try {
    const content = fs.readFileSync(metadataPath, "utf-8");
    const data = JSON.parse(content) as ExtensionMetadataFile;

    // Validate structure
    if (typeof data !== "object" || data.version !== 1) {
      console.error("[cmux] Invalid metadata file format");
      return new Map();
    }

    const map = new Map<string, ExtensionMetadata>();
    const entries = Object.entries(data.workspaces || {});

    console.log(`[cmux] Read ${entries.length} entries from extension metadata`);
    for (const [workspaceId, metadata] of entries) {
      console.log(`[cmux]   ${workspaceId}: recency=${metadata.recency}, streaming=${metadata.streaming}`);
      map.set(workspaceId, metadata);
    }

    return map;
  } catch (error) {
    console.error("[cmux] Failed to read extension metadata:", error);
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

  const metadata = readExtensionMetadata();
  const workspaces: WorkspaceWithContext[] = [];

  for (const [projectPath, projectConfig] of config.projects) {
    const projectName = path.basename(projectPath);

    for (const workspace of projectConfig.workspaces) {
      const meta = metadata.get(workspace.id);
      
      if (workspace.name === 'vscode-ext') {
        console.log(`[cmux] vscode-ext workspace:`);
        console.log(`[cmux]   id: ${workspace.id}`);
        console.log(`[cmux]   has metadata: ${!!meta}`);
        if (meta) {
          console.log(`[cmux]   metadata.recency: ${meta.recency}`);
        }
      }

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

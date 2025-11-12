import * as path from "path";
import type { RuntimeConfig, WorkspaceMetadata } from "./shared/types";
import {
  type ExtensionMetadata,
  readExtensionMetadata,
} from "./shared/extensionMetadata";

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
  const os = require("os");
  const fs = require("fs");
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
 * Get all workspaces from the cmux configuration
 */
export function getAllWorkspaces(): WorkspaceWithContext[] {
  const config = readCmuxConfig();
  if (!config) {
    return [];
  }

  const metadata = readExtensionMetadata();
  console.log(`[cmux] Read ${metadata.size} entries from extension metadata`);
  
  const workspaces: WorkspaceWithContext[] = [];

  for (const [projectPath, projectConfig] of config.projects) {
    const projectName = path.basename(projectPath);

    for (const workspace of projectConfig.workspaces) {
      const meta = metadata.get(workspace.id);
      
      if (meta) {
        console.log(`[cmux]   ${workspace.id}: recency=${meta.recency}, streaming=${meta.streaming}`);
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
  const os = require("os");
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

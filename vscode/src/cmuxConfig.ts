import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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
 * Get all workspaces from the cmux configuration
 */
export function getAllWorkspaces(): WorkspaceWithContext[] {
  const config = readCmuxConfig();
  if (!config) {
    return [];
  }

  const workspaces: WorkspaceWithContext[] = [];

  for (const [projectPath, projectConfig] of config.projects) {
    const projectName = path.basename(projectPath);
    
    for (const workspace of projectConfig.workspaces) {
      workspaces.push({
        ...workspace,
        // Ensure projectName is set (use from workspace or derive from path)
        projectName: workspace.projectName || projectName,
        projectPath,
      });
    }
  }

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

  // Ensure path starts with / for absolute path
  const basePath = srcBaseDir.startsWith("~")
    ? srcBaseDir
    : srcBaseDir.startsWith("/")
      ? srcBaseDir
      : `/${srcBaseDir}`;

  return `${basePath}/${projectName}/${workspace.name}`;
}

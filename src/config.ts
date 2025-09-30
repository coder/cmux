import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as jsonc from "jsonc-parser";
import type { WorkspaceMetadata } from "./types/workspace";

export const CONFIG_DIR = path.join(os.homedir(), ".cmux");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const PROVIDERS_FILE = path.join(CONFIG_DIR, "providers.jsonc");
export const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");

export interface Workspace {
  branch: string;
  path: string;
}

export interface ProjectConfig {
  path: string;
  workspaces: Workspace[];
}

export interface Config {
  projects: Map<string, ProjectConfig>;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export interface ProvidersConfig {
  [providerName: string]: ProviderConfig;
}

export function load_config_or_default(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(data) as { projects?: unknown };

      // Config is stored as array of [path, config] pairs
      if (parsed.projects && Array.isArray(parsed.projects)) {
        const projectsMap = new Map<string, ProjectConfig>(
          parsed.projects as Array<[string, ProjectConfig]>
        );
        return {
          projects: projectsMap,
        };
      }
    }
  } catch (error) {
    console.error("Error loading config:", error);
  }

  // Return default config
  return {
    projects: new Map(),
  };
}

export function save_config(config: Config): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const data = {
      projects: Array.from(config.projects.entries()),
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error saving config:", error);
  }
}

export function getProjectName(projectPath: string): string {
  return projectPath.split("/").pop() || projectPath.split("\\").pop() || "unknown";
}

export function getWorkspacePath(projectPath: string, branch: string): string {
  const projectName = getProjectName(projectPath);
  return path.join(CONFIG_DIR, "src", projectName, branch);
}

/**
 * Find a workspace path by project name and branch
 * @returns The workspace path or null if not found
 */
export function findWorkspacePath(projectName: string, branch: string): string | null {
  const config = load_config_or_default();

  for (const [projectPath, project] of config.projects) {
    const currentProjectName = path.basename(projectPath);

    if (currentProjectName === projectName) {
      const workspace = project.workspaces.find((w: Workspace) => w.branch === branch);
      if (workspace) {
        return workspace.path;
      }
    }
  }

  return null;
}

/**
 * Get the session directory for a specific workspace
 */
export function getSessionDir(workspaceId: string): string {
  return path.join(SESSIONS_DIR, workspaceId);
}

/**
 * Get all workspace metadata by scanning sessions directory and loading metadata files
 * This centralizes the logic for workspace discovery and metadata loading
 */
export async function getAllWorkspaceMetadata(): Promise<
  Array<{ workspaceId: string; metadata: WorkspaceMetadata }>
> {
  try {
    // Scan sessions directory for workspace directories
    await fsPromises.access(SESSIONS_DIR);
    const entries = await fsPromises.readdir(SESSIONS_DIR, { withFileTypes: true });
    const workspaceIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    const workspaceMetadata: Array<{ workspaceId: string; metadata: WorkspaceMetadata }> = [];

    for (const workspaceId of workspaceIds) {
      try {
        const metadataPath = path.join(getSessionDir(workspaceId), "metadata.json");
        const data = await fsPromises.readFile(metadataPath, "utf-8");
        const metadata = JSON.parse(data) as WorkspaceMetadata;
        workspaceMetadata.push({ workspaceId, metadata });
      } catch (error) {
        // Skip workspaces with missing or invalid metadata
        console.warn(`Failed to load metadata for workspace ${workspaceId}:`, error);
      }
    }

    return workspaceMetadata;
  } catch {
    return []; // Sessions directory doesn't exist yet
  }
}

/**
 * Load providers configuration from JSONC file
 * Supports comments in JSONC format
 */
export function loadProvidersConfig(): ProvidersConfig | null {
  try {
    if (fs.existsSync(PROVIDERS_FILE)) {
      const data = fs.readFileSync(PROVIDERS_FILE, "utf-8");
      return jsonc.parse(data) as ProvidersConfig;
    }
  } catch (error) {
    console.error("Error loading providers config:", error);
  }

  return null;
}

/**
 * Save providers configuration to JSONC file
 * @param config The providers configuration to save
 */
export function saveProvidersConfig(config: ProvidersConfig): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Format with 2-space indentation for readability
    const jsonString = JSON.stringify(config, null, 2);

    // Add a comment header to the file
    const contentWithComments = `// Providers configuration for cmux
// Configure your AI providers here
// Example:
// {
//   "anthropic": {
//     "apiKey": "sk-...",
//     "baseUrl": "https://api.anthropic.com"
//   }
// }
${jsonString}`;

    fs.writeFileSync(PROVIDERS_FILE, contentWithComments);
  } catch (error) {
    console.error("Error saving providers config:", error);
    throw error; // Re-throw to let caller handle
  }
}

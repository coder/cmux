import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as jsonc from "jsonc-parser";
import type { WorkspaceMetadata } from "./types/workspace";

export interface Workspace {
  branch: string;
  path: string;
}

export interface ProjectConfig {
  path: string;
  workspaces: Workspace[];
}

export interface ProjectsConfig {
  projects: Map<string, ProjectConfig>;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export type ProvidersConfig = Record<string, ProviderConfig>;

/**
 * Config - Centralized configuration management
 *
 * Encapsulates all config paths and operations, making them dependency-injectable
 * and testable. Pass a custom rootDir for tests to avoid polluting ~/.cmux
 */
export class Config {
  readonly rootDir: string;
  readonly sessionsDir: string;
  readonly srcDir: string;
  private readonly configFile: string;
  private readonly providersFile: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? path.join(os.homedir(), ".cmux");
    this.sessionsDir = path.join(this.rootDir, "sessions");
    this.srcDir = path.join(this.rootDir, "src");
    this.configFile = path.join(this.rootDir, "config.json");
    this.providersFile = path.join(this.rootDir, "providers.jsonc");
  }

  loadConfigOrDefault(): ProjectsConfig {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, "utf-8");
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

  saveConfig(config: ProjectsConfig): void {
    try {
      if (!fs.existsSync(this.rootDir)) {
        fs.mkdirSync(this.rootDir, { recursive: true });
      }

      const data = {
        projects: Array.from(config.projects.entries()),
      };

      fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Error saving config:", error);
    }
  }

  private getProjectName(projectPath: string): string {
    return projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "unknown";
  }

  getWorkspacePath(projectPath: string, branch: string): string {
    const projectName = this.getProjectName(projectPath);
    return path.join(this.srcDir, projectName, branch);
  }

  /**
   * Find a workspace path by project name and branch
   * @returns The workspace path or null if not found
   */
  findWorkspacePath(projectName: string, branch: string): string | null {
    const config = this.loadConfigOrDefault();

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
   * WARNING: Never try to derive workspace path from workspace ID!
   * This is a code smell that leads to bugs.
   *
   * The workspace path should always:
   * 1. Be stored in WorkspaceMetadata when the workspace is created
   * 2. Be retrieved from WorkspaceMetadata when needed
   * 3. Be passed through the call stack explicitly
   *
   * Parsing workspaceId strings to derive paths is fragile and error-prone.
   * The workspace path is established when the git worktree is created,
   * and that canonical path should be preserved and used throughout.
   */

  /**
   * Get the session directory for a specific workspace
   */
  getSessionDir(workspaceId: string): string {
    return path.join(this.sessionsDir, workspaceId);
  }

  /**
   * Get all workspace metadata by scanning sessions directory and loading metadata files
   * This centralizes the logic for workspace discovery and metadata loading
   */
  async getAllWorkspaceMetadata(): Promise<
    Array<{ workspaceId: string; metadata: WorkspaceMetadata }>
  > {
    try {
      // Scan sessions directory for workspace directories
      await fsPromises.access(this.sessionsDir);
      const entries = await fsPromises.readdir(this.sessionsDir, { withFileTypes: true });
      const workspaceIds = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      const workspaceMetadata: Array<{ workspaceId: string; metadata: WorkspaceMetadata }> = [];

      for (const workspaceId of workspaceIds) {
        try {
          const metadataPath = path.join(this.getSessionDir(workspaceId), "metadata.json");
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
  loadProvidersConfig(): ProvidersConfig | null {
    try {
      if (fs.existsSync(this.providersFile)) {
        const data = fs.readFileSync(this.providersFile, "utf-8");
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
  saveProvidersConfig(config: ProvidersConfig): void {
    try {
      if (!fs.existsSync(this.rootDir)) {
        fs.mkdirSync(this.rootDir, { recursive: true });
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

      fs.writeFileSync(this.providersFile, contentWithComments);
    } catch (error) {
      console.error("Error saving providers config:", error);
      throw error; // Re-throw to let caller handle
    }
  }
}

// Default instance for application use
export const defaultConfig = new Config();

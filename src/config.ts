import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as jsonc from "jsonc-parser";
import writeFileAtomic from "write-file-atomic";
import type { WorkspaceMetadata } from "./types/workspace";
import type { Secret, SecretsConfig } from "./types/secrets";

export interface Workspace {
  path: string; // Absolute path to workspace worktree (format: ~/.cmux/src/{projectName}/{workspaceId})
  // NOTE: The workspace ID is the basename of this path (stable random ID like 'a1b2c3d4e5').
  // Use config.getWorkspacePath(projectPath, workspaceId) to construct paths consistently.
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
  private readonly secretsFile: string;

  constructor(rootDir?: string) {
    const envRoot = process.env.CMUX_TEST_ROOT;
    this.rootDir = rootDir ?? envRoot ?? path.join(os.homedir(), ".cmux");
    this.sessionsDir = path.join(this.rootDir, "sessions");
    this.srcDir = path.join(this.rootDir, "src");
    this.configFile = path.join(this.rootDir, "config.json");
    this.providersFile = path.join(this.rootDir, "providers.jsonc");
    this.secretsFile = path.join(this.rootDir, "secrets.json");
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

      writeFileAtomic.sync(this.configFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Error saving config:", error);
    }
  }

  /**
   * Edit config atomically using a transformation function
   * @param fn Function that takes current config and returns modified config
   */
  editConfig(fn: (config: ProjectsConfig) => ProjectsConfig): void {
    const config = this.loadConfigOrDefault();
    const newConfig = fn(config);
    this.saveConfig(newConfig);
  }

  private getProjectName(projectPath: string): string {
    return projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "unknown";
  }

  /**
   * Generate a stable unique workspace ID.
   * Uses 10 random hex characters for readability while maintaining uniqueness.
   *
   * Example: "a1b2c3d4e5"
   */
  generateStableId(): string {
    // Generate 5 random bytes and convert to 10 hex chars
    return crypto.randomBytes(5).toString("hex");
  }

  /**
   * DEPRECATED: Generate workspace ID from project and workspace paths.
   * This method is used only for legacy workspace migration.
   * New workspaces should use generateStableId() instead.
   *
   * Format: ${projectBasename}-${workspaceBasename}
   */
  generateWorkspaceId(projectPath: string, workspacePath: string): string {
    const projectBasename = this.getProjectName(projectPath);
    const workspaceBasename =
      workspacePath.split("/").pop() ?? workspacePath.split("\\").pop() ?? "unknown";
    return `${projectBasename}-${workspaceBasename}`;
  }

  /**
   * Get the workspace worktree path for a given workspace ID.
   * New workspaces use stable IDs, legacy workspaces use the old format.
   */
  getWorkspacePath(projectPath: string, workspaceId: string): string {
    const projectName = this.getProjectName(projectPath);
    return path.join(this.srcDir, projectName, workspaceId);
  }

  /**
   * Get the user-friendly symlink path (using workspace name).
   * This is the path users see and can navigate to.
   */
  getWorkspaceSymlinkPath(projectPath: string, workspaceName: string): string {
    const projectName = this.getProjectName(projectPath);
    return path.join(this.srcDir, projectName, workspaceName);
  }

  /**
   * Compute both workspace paths from metadata.
   * Returns an object with the stable ID path (for operations) and named path (for display).
   */
  getWorkspacePaths(metadata: WorkspaceMetadata): {
    /** Actual worktree path with stable ID (for terminal/operations) */
    stableWorkspacePath: string;
    /** User-friendly symlink path with name (for display) */
    namedWorkspacePath: string;
  } {
    return {
      stableWorkspacePath: this.getWorkspacePath(metadata.projectPath, metadata.id),
      namedWorkspacePath: this.getWorkspaceSymlinkPath(metadata.projectPath, metadata.name),
    };
  }

  /**
   * Create a symlink from workspace name to workspace ID.
   * Example: ~/.cmux/src/cmux/feature-branch -> a1b2c3d4e5
   */
  createWorkspaceSymlink(projectPath: string, id: string, name: string): void {
    const projectName = this.getProjectName(projectPath);
    const projectDir = path.join(this.srcDir, projectName);
    const symlinkPath = path.join(projectDir, name);
    const targetPath = id; // Relative symlink

    try {
      // Remove existing symlink if it exists (use lstat to check if it's a symlink)
      try {
        const stats = fs.lstatSync(symlinkPath);
        if (stats.isSymbolicLink() || stats.isFile() || stats.isDirectory()) {
          fs.unlinkSync(symlinkPath);
        }
      } catch (e) {
        // Symlink doesn't exist, which is fine
        if (e && typeof e === "object" && "code" in e && e.code !== "ENOENT") {
          throw e;
        }
      }

      // Create new symlink (relative path)
      fs.symlinkSync(targetPath, symlinkPath, "dir");
    } catch (error) {
      console.error(`Failed to create symlink ${symlinkPath} -> ${targetPath}:`, error);
    }
  }

  /**
   * Update a workspace symlink when renaming.
   * Removes old symlink and creates new one.
   */
  updateWorkspaceSymlink(projectPath: string, oldName: string, newName: string, id: string): void {
    // Remove old symlink, then create new one (createWorkspaceSymlink handles replacement)
    this.removeWorkspaceSymlink(projectPath, oldName);
    this.createWorkspaceSymlink(projectPath, id, newName);
  }

  /**
   * Remove a workspace symlink.
   */
  removeWorkspaceSymlink(projectPath: string, name: string): void {
    const projectName = this.getProjectName(projectPath);
    const symlinkPath = path.join(this.srcDir, projectName, name);

    try {
      // Use lstat to avoid following the symlink
      const stats = fs.lstatSync(symlinkPath);
      if (stats.isSymbolicLink()) {
        fs.unlinkSync(symlinkPath);
      }
    } catch (error) {
      // ENOENT is expected if symlink doesn't exist
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return; // Silently succeed if symlink doesn't exist
      }
      console.error(`Failed to remove symlink ${symlinkPath}:`, error);
    }
  }

  /**
   * Find a workspace path and project path by workspace ID
   * @returns Object with workspace and project paths, or null if not found
   */
  findWorkspace(workspaceId: string): { workspacePath: string; projectPath: string } | null {
    const config = this.loadConfigOrDefault();

    for (const [projectPath, project] of config.projects) {
      for (const workspace of project.workspaces) {
        // Extract workspace basename (could be stable ID or legacy name)
        const workspaceBasename =
          workspace.path.split("/").pop() ?? workspace.path.split("\\").pop() ?? "unknown";

        // Try loading metadata with basename as ID (works for new workspaces)
        const metadataPath = path.join(this.getSessionDir(workspaceBasename), "metadata.json");
        if (fs.existsSync(metadataPath)) {
          try {
            const data = fs.readFileSync(metadataPath, "utf-8");
            const metadata = JSON.parse(data) as WorkspaceMetadata;
            if (metadata.id === workspaceId) {
              return { workspacePath: workspace.path, projectPath };
            }
          } catch {
            // Ignore parse errors, try next approach
          }
        }

        // Try legacy ID format
        const legacyId = this.generateWorkspaceId(projectPath, workspace.path);
        if (legacyId === workspaceId) {
          return { workspacePath: workspace.path, projectPath };
        }
      }
    }

    return null;
  }

  /**
   * Workspace Path Architecture:
   *
   * Workspace paths are computed on-demand from projectPath + workspaceId using
   * config.getWorkspacePath(). This ensures single source of truth for path format.
   *
   * Backend: Uses getWorkspacePath(metadata.projectPath, metadata.id) for operations
   * Frontend: Gets enriched metadata with paths via IPC (FrontendWorkspaceMetadata)
   *
   * WorkspaceMetadata.workspacePath is deprecated and will be removed. Use computed
   * paths from getWorkspacePath() or getWorkspacePaths() instead.
   */

  /**
   * Get the session directory for a specific workspace
   */
  getSessionDir(workspaceId: string): string {
    return path.join(this.sessionsDir, workspaceId);
  }

  /**
   * Get all workspace metadata by loading config and metadata files.
   * Performs eager migration for legacy workspaces on startup.
   *
   * Migration strategy:
   * - For each workspace in config, try to load metadata.json from session dir
   * - If metadata exists, use it (already migrated or new workspace)
   * - If metadata doesn't exist, this is a legacy workspace:
   *   - Generate legacy ID from path (for backward compatibility)
   *   - Extract name from workspace path
   *   - Create and save metadata.json
   *   - Create symlink if name differs from ID (new workspaces only)
   */
  getAllWorkspaceMetadata(): WorkspaceMetadata[] {
    const config = this.loadConfigOrDefault();
    const workspaceMetadata: WorkspaceMetadata[] = [];

    for (const [projectPath, projectConfig] of config.projects) {
      const projectName = this.getProjectName(projectPath);

      for (const workspace of projectConfig.workspaces) {
        // Extract workspace basename from path (could be stable ID or legacy name)
        const workspaceBasename =
          workspace.path.split("/").pop() ?? workspace.path.split("\\").pop() ?? "unknown";

        try {
          // Try to load metadata using workspace basename as ID (works for new workspaces with stable IDs)
          let metadataPath = path.join(this.getSessionDir(workspaceBasename), "metadata.json");

          if (fs.existsSync(metadataPath)) {
            const data = fs.readFileSync(metadataPath, "utf-8");
            const metadata = JSON.parse(data) as WorkspaceMetadata;
            workspaceMetadata.push(metadata);
          } else {
            // Try legacy ID format (project-workspace)
            const legacyId = this.generateWorkspaceId(projectPath, workspace.path);
            metadataPath = path.join(this.getSessionDir(legacyId), "metadata.json");

            if (fs.existsSync(metadataPath)) {
              const data = fs.readFileSync(metadataPath, "utf-8");
              const metadata = JSON.parse(data) as WorkspaceMetadata;
              workspaceMetadata.push(metadata);
            } else {
              // No metadata found - create it for legacy workspace
              const metadata: WorkspaceMetadata = {
                id: legacyId, // Use legacy ID format for backward compatibility
                name: workspaceBasename,
                projectName,
                projectPath, // Add full project path
                // No createdAt for legacy workspaces (unknown)
              };

              // Save metadata for future loads
              const sessionDir = this.getSessionDir(legacyId);
              if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
              }
              fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

              workspaceMetadata.push(metadata);
            }
          }
        } catch (error) {
          console.error(`Failed to load/migrate workspace metadata:`, error);
          // Fallback to basic metadata if migration fails
          const legacyId = this.generateWorkspaceId(projectPath, workspace.path);
          workspaceMetadata.push({
            id: legacyId,
            name: workspaceBasename,
            projectName,
            projectPath, // Add full project path
          });
        }
      }
    }

    return workspaceMetadata;
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

  /**
   * Load secrets configuration from JSON file
   * Returns empty config if file doesn't exist
   */
  loadSecretsConfig(): SecretsConfig {
    try {
      if (fs.existsSync(this.secretsFile)) {
        const data = fs.readFileSync(this.secretsFile, "utf-8");
        return JSON.parse(data) as SecretsConfig;
      }
    } catch (error) {
      console.error("Error loading secrets config:", error);
    }

    return {};
  }

  /**
   * Save secrets configuration to JSON file
   * @param config The secrets configuration to save
   */
  saveSecretsConfig(config: SecretsConfig): void {
    try {
      if (!fs.existsSync(this.rootDir)) {
        fs.mkdirSync(this.rootDir, { recursive: true });
      }

      writeFileAtomic.sync(this.secretsFile, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error("Error saving secrets config:", error);
      throw error;
    }
  }

  /**
   * Get secrets for a specific project
   * @param projectPath The path to the project
   * @returns Array of secrets for the project, or empty array if none
   */
  getProjectSecrets(projectPath: string): Secret[] {
    const config = this.loadSecretsConfig();
    return config[projectPath] ?? [];
  }

  /**
   * Update secrets for a specific project
   * @param projectPath The path to the project
   * @param secrets The secrets to save for the project
   */
  updateProjectSecrets(projectPath: string, secrets: Secret[]): void {
    const config = this.loadSecretsConfig();
    config[projectPath] = secrets;
    this.saveSecretsConfig(config);
  }
}

// Default instance for application use
export const defaultConfig = new Config();

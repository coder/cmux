import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as jsonc from "jsonc-parser";
import writeFileAtomic from "write-file-atomic";
import type { WorkspaceMetadata, FrontendWorkspaceMetadata } from "./types/workspace";
import type { Secret, SecretsConfig } from "./types/secrets";
import type { Workspace, ProjectConfig, ProjectsConfig } from "./types/project";

// Re-export project types from dedicated types file (for preload usage)
export type { Workspace, ProjectConfig, ProjectsConfig };

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
   * Compute workspace path from metadata.
   * Directory uses workspace id (e.g., ~/.cmux/src/project/a1b2c3d4e5).
   * For legacy workspaces, id may be in old format (e.g., cmux-feature-branch).
   */
  getWorkspacePaths(metadata: WorkspaceMetadata): {
    /** Worktree path (uses workspace id as directory) */
    namedWorkspacePath: string;
  } {
    const path = this.getWorkspacePath(metadata.projectPath, metadata.id);
    return {
      namedWorkspacePath: path,
    };
  }

  /**
   * Add paths to WorkspaceMetadata to create FrontendWorkspaceMetadata.
   * Helper to avoid duplicating path computation logic.
   */
  private addPathsToMetadata(
    metadata: WorkspaceMetadata,
    workspacePath: string,
    _projectPath: string
  ): FrontendWorkspaceMetadata {
    return {
      ...metadata,
      namedWorkspacePath: workspacePath,
    };
  }

  /**
   * Find a workspace path and project path by workspace ID
   * @returns Object with workspace and project paths, or null if not found
   */
  findWorkspace(workspaceId: string): { workspacePath: string; projectPath: string } | null {
    const config = this.loadConfigOrDefault();

    for (const [projectPath, project] of config.projects) {
      for (const workspace of project.workspaces) {
        // NEW FORMAT: Check config first (primary source of truth after migration)
        if (workspace.id === workspaceId) {
          return { workspacePath: workspace.path, projectPath };
        }

        // LEGACY FORMAT: Fall back to metadata.json and legacy ID for unmigrated workspaces
        if (!workspace.id) {
          // Extract workspace basename (could be stable ID or legacy name)
          const workspaceBasename =
            workspace.path.split("/").pop() ?? workspace.path.split("\\").pop() ?? "unknown";

          // Try loading metadata with basename as ID (works for old workspaces)
          const metadataPath = path.join(this.getSessionDir(workspaceBasename), "metadata.json");
          if (fs.existsSync(metadataPath)) {
            try {
              const data = fs.readFileSync(metadataPath, "utf-8");
              const metadata = JSON.parse(data) as WorkspaceMetadata;
              if (metadata.id === workspaceId) {
                return { workspacePath: workspace.path, projectPath };
              }
            } catch {
              // Ignore parse errors, try legacy ID
            }
          }

          // Try legacy ID format as last resort
          const legacyId = this.generateWorkspaceId(projectPath, workspace.path);
          if (legacyId === workspaceId) {
            return { workspacePath: workspace.path, projectPath };
          }
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
   * Backend: Uses getWorkspacePath(metadata.projectPath, metadata.name) for directory paths (worktree directories use name)
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
   *
   * Returns FrontendWorkspaceMetadata with paths already computed.
   * This eliminates the need for separate "enrichment" - paths are computed
   * once during the loop when we already have all the necessary data.
   *
   * NEW BEHAVIOR: Config is the primary source of truth
   * - If workspace has id/name/createdAt in config, use those directly
   * - If workspace only has path, fall back to reading metadata.json
   * - Migrate old workspaces by copying metadata from files to config
   *
   * This centralizes workspace metadata in config.json and eliminates the need
   * for scattered metadata.json files (kept for backward compat with older versions).
   */
  getAllWorkspaceMetadata(): FrontendWorkspaceMetadata[] {
    const config = this.loadConfigOrDefault();
    const workspaceMetadata: FrontendWorkspaceMetadata[] = [];
    let configModified = false;

    for (const [projectPath, projectConfig] of config.projects) {
      const projectName = this.getProjectName(projectPath);

      for (const workspace of projectConfig.workspaces) {
        try {
          // NEW FORMAT: If workspace has metadata in config, use it directly
          if (workspace.id) {
            const metadata: WorkspaceMetadata = {
              id: workspace.id,
              // Use title if present, otherwise fallback to legacy name field
              title: workspace.title ?? (workspace as { name?: string }).name ?? undefined,
              projectName,
              projectPath,
              createdAt: workspace.createdAt,
            };
            workspaceMetadata.push(this.addPathsToMetadata(metadata, workspace.path, projectPath));
            continue; // Skip metadata file lookup
          }

          // LEGACY FORMAT: Fall back to reading metadata.json
          // Try legacy ID format first (project-workspace) - used by E2E tests and old workspaces
          const legacyId = this.generateWorkspaceId(projectPath, workspace.path);
          const metadataPath = path.join(this.getSessionDir(legacyId), "metadata.json");
          let metadataFound = false;

          if (fs.existsSync(metadataPath)) {
            const data = fs.readFileSync(metadataPath, "utf-8");
            const legacyMetadata = JSON.parse(data) as WorkspaceMetadata & { name?: string };

            // Migrate from old format: use name as fallback title
            const metadata: WorkspaceMetadata = {
              id: legacyMetadata.id,
              title: legacyMetadata.name ?? undefined, // Use legacy name as fallback title
              projectName: legacyMetadata.projectName ?? projectName,
              projectPath: legacyMetadata.projectPath ?? projectPath,
              createdAt: legacyMetadata.createdAt,
            };

            // Migrate to config for next load
            workspace.id = metadata.id;
            workspace.title = legacyMetadata.name ?? undefined; // Preserve legacy name as title
            workspace.createdAt = metadata.createdAt;
            configModified = true;

            workspaceMetadata.push(this.addPathsToMetadata(metadata, workspace.path, projectPath));
            metadataFound = true;
          }

          // No metadata found anywhere - create basic metadata
          if (!metadataFound) {
            const legacyId = this.generateWorkspaceId(projectPath, workspace.path);
            const metadata: WorkspaceMetadata = {
              id: legacyId,
              title: undefined, // Will be generated after first message
              projectName,
              projectPath,
            };

            // Save to config for next load
            workspace.id = metadata.id;
            workspace.title = undefined;
            configModified = true;

            workspaceMetadata.push(this.addPathsToMetadata(metadata, workspace.path, projectPath));
          }
        } catch (error) {
          console.error(`Failed to load/migrate workspace metadata:`, error);
          // Fallback to basic metadata if migration fails
          const legacyId = this.generateWorkspaceId(projectPath, workspace.path);
          const metadata: WorkspaceMetadata = {
            id: legacyId,
            title: undefined, // No title for fallback case
            projectName,
            projectPath,
          };
          workspaceMetadata.push(this.addPathsToMetadata(metadata, workspace.path, projectPath));
        }
      }
    }

    // Save config if we migrated any workspaces
    if (configModified) {
      this.saveConfig(config);
    }

    return workspaceMetadata;
  }

  /**
   * Add a workspace to config.json (single source of truth for workspace metadata).
   * Creates project entry if it doesn't exist.
   *
   * @param projectPath Absolute path to the project
   * @param metadata Workspace metadata to save
   */
  addWorkspace(projectPath: string, metadata: WorkspaceMetadata): void {
    this.editConfig((config) => {
      let project = config.projects.get(projectPath);

      if (!project) {
        project = { workspaces: [] };
        config.projects.set(projectPath, project);
      }

      // Check if workspace already exists (by ID)
      const existingIndex = project.workspaces.findIndex((w) => w.id === metadata.id);

      const workspacePath = this.getWorkspacePath(projectPath, metadata.id);
      const workspaceEntry: Workspace = {
        path: workspacePath,
        id: metadata.id,
        title: metadata.title,
        createdAt: metadata.createdAt,
      };

      if (existingIndex >= 0) {
        // Update existing workspace
        project.workspaces[existingIndex] = workspaceEntry;
      } else {
        // Add new workspace
        project.workspaces.push(workspaceEntry);
      }

      return config;
    });
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

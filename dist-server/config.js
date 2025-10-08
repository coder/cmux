"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = exports.Config = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const jsonc = __importStar(require("jsonc-parser"));
const write_file_atomic_1 = __importDefault(require("write-file-atomic"));
/**
 * Config - Centralized configuration management
 *
 * Encapsulates all config paths and operations, making them dependency-injectable
 * and testable. Pass a custom rootDir for tests to avoid polluting ~/.cmux
 */
class Config {
    rootDir;
    sessionsDir;
    srcDir;
    configFile;
    providersFile;
    constructor(rootDir) {
        this.rootDir = rootDir ?? path.join(os.homedir(), ".cmux");
        this.sessionsDir = path.join(this.rootDir, "sessions");
        this.srcDir = path.join(this.rootDir, "src");
        this.configFile = path.join(this.rootDir, "config.json");
        this.providersFile = path.join(this.rootDir, "providers.jsonc");
    }
    loadConfigOrDefault() {
        try {
            if (fs.existsSync(this.configFile)) {
                const data = fs.readFileSync(this.configFile, "utf-8");
                const parsed = JSON.parse(data);
                // Config is stored as array of [path, config] pairs
                if (parsed.projects && Array.isArray(parsed.projects)) {
                    const projectsMap = new Map(parsed.projects);
                    return {
                        projects: projectsMap,
                    };
                }
            }
        }
        catch (error) {
            console.error("Error loading config:", error);
        }
        // Return default config
        return {
            projects: new Map(),
        };
    }
    saveConfig(config) {
        try {
            if (!fs.existsSync(this.rootDir)) {
                fs.mkdirSync(this.rootDir, { recursive: true });
            }
            const data = {
                projects: Array.from(config.projects.entries()),
            };
            write_file_atomic_1.default.sync(this.configFile, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error("Error saving config:", error);
        }
    }
    /**
     * Edit config atomically using a transformation function
     * @param fn Function that takes current config and returns modified config
     */
    editConfig(fn) {
        const config = this.loadConfigOrDefault();
        const newConfig = fn(config);
        this.saveConfig(newConfig);
    }
    getProjectName(projectPath) {
        return projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "unknown";
    }
    /**
     * Generate workspace ID from project and workspace paths.
     * This is the CENTRAL place for workspace ID generation.
     * Format: ${projectBasename}-${workspaceBasename}
     *
     * NEVER duplicate this logic elsewhere - always call this method.
     */
    generateWorkspaceId(projectPath, workspacePath) {
        const projectBasename = this.getProjectName(projectPath);
        const workspaceBasename = workspacePath.split("/").pop() ?? workspacePath.split("\\").pop() ?? "unknown";
        return `${projectBasename}-${workspaceBasename}`;
    }
    getWorkspacePath(projectPath, branch) {
        const projectName = this.getProjectName(projectPath);
        return path.join(this.srcDir, projectName, branch);
    }
    /**
     * Find a workspace path and project path by workspace ID
     * @returns Object with workspace and project paths, or null if not found
     */
    findWorkspace(workspaceId) {
        const config = this.loadConfigOrDefault();
        for (const [projectPath, project] of config.projects) {
            for (const workspace of project.workspaces) {
                const generatedId = this.generateWorkspaceId(projectPath, workspace.path);
                if (generatedId === workspaceId) {
                    return { workspacePath: workspace.path, projectPath };
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
    getSessionDir(workspaceId) {
        return path.join(this.sessionsDir, workspaceId);
    }
    /**
     * Get all workspace metadata by loading config and generating IDs.
     * This is the CENTRAL place for workspace ID generation.
     *
     * IDs are generated using the formula: ${projectBasename}-${workspaceBasename}
     * This ensures single source of truth and makes config format migration-free.
     */
    getAllWorkspaceMetadata() {
        const config = this.loadConfigOrDefault();
        const workspaceMetadata = [];
        for (const [projectPath, projectConfig] of config.projects) {
            const projectName = this.getProjectName(projectPath);
            for (const workspace of projectConfig.workspaces) {
                const workspaceId = this.generateWorkspaceId(projectPath, workspace.path);
                workspaceMetadata.push({
                    id: workspaceId,
                    projectName,
                    workspacePath: workspace.path,
                });
            }
        }
        return workspaceMetadata;
    }
    /**
     * Load providers configuration from JSONC file
     * Supports comments in JSONC format
     */
    loadProvidersConfig() {
        try {
            if (fs.existsSync(this.providersFile)) {
                const data = fs.readFileSync(this.providersFile, "utf-8");
                return jsonc.parse(data);
            }
        }
        catch (error) {
            console.error("Error loading providers config:", error);
        }
        return null;
    }
    /**
     * Save providers configuration to JSONC file
     * @param config The providers configuration to save
     */
    saveProvidersConfig(config) {
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
        }
        catch (error) {
            console.error("Error saving providers config:", error);
            throw error; // Re-throw to let caller handle
        }
    }
}
exports.Config = Config;
// Default instance for application use
exports.defaultConfig = new Config();
//# sourceMappingURL=config.js.map
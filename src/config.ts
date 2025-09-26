import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.cmux');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');

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

export function load_config_or_default(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Config is stored as array of [path, config] pairs
      if (parsed.projects && Array.isArray(parsed.projects)) {
        const projectsMap = new Map<string, ProjectConfig>(parsed.projects);
        return {
          projects: projectsMap
        };
      }
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }

  // Return default config
  return {
    projects: new Map()
  };
}

export function save_config(config: Config): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const data = {
      projects: Array.from(config.projects.entries())
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

export function getProjectName(projectPath: string): string {
  return projectPath.split('/').pop() || projectPath.split('\\').pop() || 'unknown';
}

export function getWorkspacePath(projectPath: string, branch: string): string {
  const projectName = getProjectName(projectPath);
  return path.join(CONFIG_DIR, 'src', projectName, branch);
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
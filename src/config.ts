import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.cmux');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

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
      
      // Handle migration from old format
      if (Array.isArray(parsed.projects)) {
        // Old format: array of strings
        const projectsMap = new Map<string, ProjectConfig>();
        parsed.projects.forEach((path: string) => {
          if (typeof path === 'string') {
            projectsMap.set(path, { path, workspaces: [] });
          }
        });
        return { projects: projectsMap };
      } else if (parsed.projects) {
        // New format: array of [path, config] pairs
        return {
          projects: new Map(parsed.projects)
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
  return path.join(CONFIG_DIR, projectName, branch);
}
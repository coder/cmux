import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.cmux');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface Config {
  projects: Set<string>;
}

export function load_config_or_default(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        projects: new Set(parsed.projects || [])
      };
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }

  // Return default config
  return {
    projects: new Set([
      '/Users/ammar/Projects/example1',
      '/Users/ammar/Projects/example2'
    ])
  };
}

export function save_config(config: Config): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const data = {
      projects: Array.from(config.projects)
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}
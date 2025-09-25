import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// Import types for TypeScript
type Query = any;
type SDKMessage = any;
type Options = any;

// We'll load the actual query function dynamically
let queryFunction: any = null;

interface WorkspaceSession {
  projectName: string;
  branch: string;
  workspacePath: string;
  sessionId: string;
  query: Query | null;
  isActive: boolean;
  output: SDKMessage[];
}

interface SessionData {
  [key: string]: string; // workspace key -> session ID
}

export class ClaudeService extends EventEmitter {
  private workspaces: Map<string, WorkspaceSession> = new Map();
  private sessionFile: string;
  private sdkLoaded: boolean = false;

  constructor() {
    super();
    const configDir = path.join(os.homedir(), '.cmux');
    this.sessionFile = path.join(configDir, 'sessions.json');
    // Load SDK asynchronously without blocking constructor
    this.loadSDK().catch(error => {
      console.error('Failed to initialize Claude SDK:', error);
    });
  }

  private async loadSDK(): Promise<void> {
    if (this.sdkLoaded) return;
    
    try {
      // Use Function constructor to ensure true dynamic import
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const claudeModule = await dynamicImport('@anthropic-ai/claude-code');
      queryFunction = claudeModule.query;
      this.sdkLoaded = true;
      console.log('Claude Code SDK loaded successfully');
    } catch (error) {
      console.error('Failed to load Claude Code SDK:', error);
      throw error;
    }
  }

  private getWorkspaceKey(projectName: string, branch: string): string {
    return `${projectName}-${branch}`;
  }

  private async loadSessions(): Promise<SessionData> {
    try {
      const data = await fs.readFile(this.sessionFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  private async saveSessions(sessions: SessionData): Promise<void> {
    const dir = path.dirname(this.sessionFile);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.sessionFile, JSON.stringify(sessions, null, 2));
  }

  async startWorkspace(
    workspacePath: string,
    projectName: string,
    branch: string
  ): Promise<boolean> {
    // Ensure SDK is loaded
    await this.loadSDK();
    
    if (!queryFunction) {
      console.error('Claude Code SDK not loaded');
      return false;
    }
    
    const key = this.getWorkspaceKey(projectName, branch);
    
    // Check if already running
    const existing = this.workspaces.get(key);
    if (existing?.isActive) {
      console.log(`Workspace ${key} is already active`);
      return false;
    }

    try {
      // Load saved session IDs
      const sessions = await this.loadSessions();
      const existingSessionId = sessions[key];

      const session: WorkspaceSession = {
        projectName,
        branch,
        workspacePath,
        sessionId: existingSessionId || crypto.randomUUID(),
        query: null,
        isActive: true,
        output: []
      };

      // Configure options for the SDK
      const options: Options = {
        cwd: workspacePath,
        permissionMode: 'default',
        // Use resume for existing sessions
        resume: existingSessionId,
        continue: !!existingSessionId
      };

      // Create prompt based on whether we're resuming
      const prompt = existingSessionId 
        ? `Resuming session in ${projectName} on branch ${branch}. I'm here to help with your coding tasks.`
        : `Starting new session in ${projectName} on branch ${branch}. I'm ready to help with your coding tasks.`;

      // Start the query using the dynamically loaded function
      session.query = queryFunction({ prompt, options });
      
      this.workspaces.set(key, session);

      // Save session ID for future restarts
      sessions[key] = session.sessionId;
      await this.saveSessions(sessions);

      // Stream output in the background
      this.streamOutput(key, session);

      return true;
    } catch (error) {
      console.error(`Failed to start workspace ${key}:`, error);
      return false;
    }
  }

  private async streamOutput(key: string, session: WorkspaceSession): Promise<void> {
    if (!session.query) return;

    try {
      for await (const message of session.query) {
        // Check if still active
        if (!session.isActive) {
          break;
        }

        // Store output
        session.output.push(message);

        // Emit output event
        this.emit('output', {
          workspace: key,
          message,
          projectName: session.projectName,
          branch: session.branch
        });
      }
    } catch (error) {
      console.error(`Error streaming output for ${key}:`, error);
      session.isActive = false;
    }
  }

  async stopWorkspace(projectName: string, branch: string): Promise<void> {
    const key = this.getWorkspaceKey(projectName, branch);
    const session = this.workspaces.get(key);
    
    if (session) {
      session.isActive = false;
      
      // Interrupt the query if possible
      if (session.query?.interrupt) {
        try {
          await session.query.interrupt();
        } catch (error) {
          console.error(`Error interrupting query for ${key}:`, error);
        }
      }
      
      session.query = null;
    }
  }

  async stopAllWorkspaces(): Promise<void> {
    const stopPromises = [];
    
    for (const [_, session] of this.workspaces) {
      if (session.isActive) {
        stopPromises.push(this.stopWorkspace(session.projectName, session.branch));
      }
    }
    
    await Promise.all(stopPromises);
  }

  getWorkspaceOutput(projectName: string, branch: string): SDKMessage[] {
    const key = this.getWorkspaceKey(projectName, branch);
    const session = this.workspaces.get(key);
    return session?.output || [];
  }

  isWorkspaceActive(projectName: string, branch: string): boolean {
    const key = this.getWorkspaceKey(projectName, branch);
    const session = this.workspaces.get(key);
    return session?.isActive || false;
  }

  getActiveWorkspaces(): Array<{ projectName: string; branch: string }> {
    const active = [];
    
    for (const [_, session] of this.workspaces) {
      if (session.isActive) {
        active.push({
          projectName: session.projectName,
          branch: session.branch
        });
      }
    }
    
    return active;
  }

  async autoStartAllWorkspaces(
    projects: Map<string, { path: string; workspaces: Array<{ branch: string; path: string }> }>
  ): Promise<void> {
    const startPromises = [];
    
    for (const [projectPath, project] of projects) {
      const projectName = projectPath.split('/').pop() || projectPath.split('\\').pop() || 'unknown';
      
      for (const workspace of project.workspaces) {
        startPromises.push(
          this.startWorkspace(workspace.path, projectName, workspace.branch)
        );
      }
    }
    
    const results = await Promise.all(startPromises);
    const successCount = results.filter(r => r === true).length;
    
    console.log(`Started ${successCount} out of ${startPromises.length} workspaces`);
  }
}

// Export singleton instance
export default new ClaudeService();
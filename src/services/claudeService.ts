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

// Safe console.log wrapper that catches EPIPE errors
function safeLog(...args: any[]): void {
  try {
    // Convert objects to simple strings to avoid serialization issues
    const safeArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        // For objects, only log type and key properties
        if (arg.type) return `[${arg.type}${arg.subtype ? '/' + arg.subtype : ''}]`;
        if (arg.message) return '[Message Object]';
        return '[Object]';
      }
      return arg;
    });
    console.log(...safeArgs);
  } catch (error: any) {
    // Silently ignore EPIPE and other console errors
    if (error.code !== 'EPIPE') {
      // Only log non-EPIPE errors to stderr as a last resort
      try {
        process.stderr.write(`Console error: ${error.message}\n`);
      } catch {
        // Even stderr might fail, just ignore
      }
    }
  }
}

// Safe safeError wrapper
function safeError(...args: any[]): void {
  try {
    const safeArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        // For errors, try to get the message
        if (arg instanceof Error) return `Error: ${arg.message}`;
        if (arg.type) return `[${arg.type}${arg.subtype ? '/' + arg.subtype : ''}]`;
        return '[Object]';
      }
      return arg;
    });
    safeError(...safeArgs);
  } catch (error: any) {
    // Silently ignore EPIPE and other console errors
    if (error.code !== 'EPIPE') {
      try {
        process.stderr.write(`Console error: ${error.message}\n`);
      } catch {
        // Even stderr might fail, just ignore
      }
    }
  }
}

interface WorkspaceSession {
  projectName: string;
  branch: string;
  workspacePath: string;
  sessionId: string;
  query: Query | null;
  isActive: boolean;
  output: SDKMessage[];
  messageController: MessageController | null;
}

class MessageController {
  private resolveNext: ((value: any) => void) | null = null;
  private messageQueue: any[] = [];
  private isDone: boolean = false;

  async *getAsyncIterable() {
    while (!this.isDone) {
      if (this.messageQueue.length > 0) {
        yield this.messageQueue.shift();
      } else {
        // Wait for the next message
        await new Promise<void>((resolve) => {
          this.resolveNext = resolve;
        });
        if (this.messageQueue.length > 0) {
          yield this.messageQueue.shift();
        }
      }
    }
  }

  sendMessage(message: any) {
    this.messageQueue.push(message);
    if (this.resolveNext) {
      this.resolveNext(undefined);
      this.resolveNext = null;
    }
  }

  close() {
    this.isDone = true;
    if (this.resolveNext) {
      this.resolveNext(undefined);
      this.resolveNext = null;
    }
  }
}

interface WorkspaceData {
  sessionId: string;
  history: SDKMessage[];
}

export class ClaudeService extends EventEmitter {
  private workspaces: Map<string, WorkspaceSession> = new Map();
  private configDir: string;
  private sdkLoaded: boolean = false;

  constructor() {
    super();
    this.configDir = path.join(os.homedir(), '.cmux');
    // Load SDK asynchronously without blocking constructor
    this.loadSDK().catch(error => {
      safeError('Failed to initialize Claude SDK:', error);
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
      safeLog('Claude Code SDK loaded successfully');
    } catch (error) {
      safeError('Failed to load Claude Code SDK:', error);
      throw error;
    }
  }

  private getWorkspaceKey(projectName: string, branch: string): string {
    return `${projectName}-${branch}`;
  }

  private getWorkspaceDir(workspaceKey: string): string {
    return path.join(this.configDir, 'workspaces', workspaceKey);
  }

  private getWorkspaceFile(workspaceKey: string): string {
    return path.join(this.getWorkspaceDir(workspaceKey), 'session.json');
  }

  private async loadWorkspaceData(workspaceKey: string): Promise<WorkspaceData> {
    try {
      const workspaceFile = this.getWorkspaceFile(workspaceKey);
      const data = await fs.readFile(workspaceFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Validate the loaded data
      if (parsed.sessionId && Array.isArray(parsed.history)) {
        return parsed;
      }
      
      // Invalid data, fall through to create new
    } catch {
      // File doesn't exist or can't be read, create new
    }
    
    // Create new workspace data only if file doesn't exist or is invalid
    return {
      sessionId: crypto.randomUUID(),
      history: []
    };
  }

  private async saveWorkspaceData(workspaceKey: string, data: WorkspaceData): Promise<void> {
    try {
      const workspaceFile = this.getWorkspaceFile(workspaceKey);
      const dir = path.dirname(workspaceFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(workspaceFile, JSON.stringify(data, null, 2));
    } catch (error) {
      safeError(`Failed to save workspace data for ${workspaceKey}:`, error);
    }
  }


  async startWorkspace(
    workspacePath: string,
    projectName: string,
    branch: string
  ): Promise<boolean> {
    // Ensure SDK is loaded
    await this.loadSDK();
    
    if (!queryFunction) {
      safeError('Claude Code SDK not loaded');
      return false;
    }
    
    const key = this.getWorkspaceKey(projectName, branch);
    
    // Check if already running
    const existing = this.workspaces.get(key);
    if (existing?.isActive) {
      safeLog(`Workspace ${key} is already active`);
      return false;
    }

    try {
      // Load workspace data (session ID + history)
      const workspaceData = await this.loadWorkspaceData(key);
      safeLog(`[${key}] Loaded workspace data:`, {
        sessionId: workspaceData.sessionId,
        historyLength: workspaceData.history.length,
        isResuming: workspaceData.history.length > 0
      });

      // Create message controller for streaming input
      const messageController = new MessageController();

      const session: WorkspaceSession = {
        projectName,
        branch,
        workspacePath,
        sessionId: workspaceData.sessionId,
        query: null,
        isActive: true,
        output: [...workspaceData.history], // Restore previous conversation history
        messageController
      };

      // Configure options for the SDK
      const options: Options = {
        cwd: workspacePath,
        permissionMode: 'default',
        // Use resume for existing sessions
        resume: workspaceData.history.length > 0 ? workspaceData.sessionId : undefined,
        continue: workspaceData.history.length > 0,
        // Enable partial messages for streaming
        includePartialMessages: true
      };

      // Start the query using streaming input mode (no initial message)
      session.query = queryFunction({ 
        prompt: messageController.getAsyncIterable(), 
        options 
      });
      
      this.workspaces.set(key, session);

      // Save workspace data (session ID + history) for future restarts
      await this.saveWorkspaceData(key, {
        sessionId: session.sessionId,
        history: session.output
      });

      // Stream output in the background
      this.streamOutput(key, session);

      return true;
    } catch (error) {
      safeError(`Failed to start workspace ${key}:`, error);
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

        // Add sequence number for ordering and store output
        const messageWithSequence = {
          ...message,
          _sequenceNumber: session.output.length
        };
        session.output.push(messageWithSequence);
        
        // If this is the first system/init message, use Claude's session ID for future resumes
        if (message.type === 'system' && message.subtype === 'init' && message.session_id) {
          session.sessionId = message.session_id;
          safeLog(`[${key}] Updated session ID to Claude's ID:`, message.session_id);
        }
        
        // Save conversation history to disk
        await this.saveWorkspaceData(key, {
          sessionId: session.sessionId,
          history: session.output
        });
        
        // Debug logging to see what messages we're receiving
        safeLog(`[${key}] Received message:`, {
          type: message.type,
          subtype: message.subtype,
          uuid: message.uuid,
          hasMessage: !!message.message,
          messageRole: message.message?.role
        });

        // Emit output event
        this.emit('output', {
          workspace: key,
          message: messageWithSequence,
          projectName: session.projectName,
          branch: session.branch
        });
      }
    } catch (error) {
      safeError(`Error streaming output for ${key}:`, error);
      session.isActive = false;
    }
  }

  async stopWorkspace(projectName: string, branch: string): Promise<void> {
    const key = this.getWorkspaceKey(projectName, branch);
    const session = this.workspaces.get(key);
    
    if (session) {
      session.isActive = false;
      
      // Close message controller
      if (session.messageController) {
        session.messageController.close();
        session.messageController = null;
      }
      
      // Interrupt the query if possible
      if (session.query?.interrupt) {
        try {
          await session.query.interrupt();
        } catch (error) {
          safeError(`Error interrupting query for ${key}:`, error);
        }
      }
      
      session.query = null;
    }
  }

  async sendMessage(projectName: string, branch: string, message: string): Promise<boolean> {
    const key = this.getWorkspaceKey(projectName, branch);
    const session = this.workspaces.get(key);
    
    if (!session || !session.isActive || !session.messageController) {
      safeError(`Cannot send message: workspace ${key} is not active`);
      return false;
    }

    try {
      // Create SDK user message with sequence-based ordering
      const userMessage = {
        type: 'user',
        session_id: session.sessionId,
        message: {
          role: 'user',
          content: message
        },
        parent_tool_use_id: null,
        uuid: `user-${Date.now()}-${Math.random()}`, // Generate UUID for deduplication
        _sequenceNumber: session.output.length, // Use current length as sequence for ordering
        timestamp: Date.now()
      };

      // Send message through the controller
      // Avoid safeLog of large objects to prevent EPIPE errors
      session.messageController.sendMessage(userMessage);
      
      // Also store the user message in our local output for persistence
      session.output.push(userMessage);
      
      // Save conversation history to disk
      await this.saveWorkspaceData(key, {
        sessionId: session.sessionId,
        history: session.output
      });
      
      // Emit the user message locally so it appears in UI immediately
      this.emit('output', {
        workspace: key,
        message: userMessage,
        projectName: session.projectName,
        branch: session.branch
      });
      
      return true;
    } catch (error) {
      safeError(`Failed to send message to ${key}:`, error);
      return false;
    }
  }

  async handleSlashCommand(projectName: string, branch: string, command: string): Promise<boolean> {
    const key = this.getWorkspaceKey(projectName, branch);
    const commandLower = command.toLowerCase().trim();
    
    // Handle /clear command specially
    if (commandLower === '/clear') {
      try {
        safeLog(`[${key}] Executing /clear command`);
        
        // Stop the current workspace
        await this.stopWorkspace(projectName, branch);
        
        // Clear the persisted history
        const newSessionId = crypto.randomUUID();
        await this.saveWorkspaceData(key, {
          sessionId: newSessionId,
          history: []
        });
        
        // Get workspace path
        const workspacePath = path.join(this.configDir, 'workspaces', key);
        
        // Start a fresh workspace session
        const startSuccess = await this.startWorkspace(workspacePath, projectName, branch);
        
        if (startSuccess) {
          // Emit a clear event so UI can update
          this.emit('clear', {
            workspace: key,
            projectName,
            branch
          });
        }
        
        return startSuccess;
      } catch (error) {
        safeError(`Failed to execute /clear for ${key}:`, error);
        return false;
      }
    }
    
    // For other slash commands, pass them through to the SDK
    // The SDK will handle them internally
    return this.sendMessage(projectName, branch, command);
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
    
    safeLog(`Started ${successCount} out of ${startPromises.length} workspaces`);
  }
}

// Export singleton instance
export default new ClaudeService();
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { EventEmitter } from "events";
import { findWorkspacePath } from "../config";
import { Result, Ok, Err } from "../types/result";
import { UIPermissionMode, SDKPermissionMode } from "../types/global";

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
    const safeArgs = args.map((arg) => {
      if (typeof arg === "object" && arg !== null) {
        // For objects, only log type and key properties
        if (arg.type)
          return `[${arg.type}${arg.subtype ? "/" + arg.subtype : ""}]`;
        if (arg.message) return "[Message Object]";
        return "[Object]";
      }
      return arg;
    });
    console.log(...safeArgs);
  } catch (error: any) {
    // Silently ignore EPIPE and other console errors
    if (error.code !== "EPIPE") {
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
    const safeArgs = args.map((arg) => {
      if (typeof arg === "object" && arg !== null) {
        // For errors, try to get the message
        if (arg instanceof Error) return `Error: ${arg.message}`;
        if (arg.type)
          return `[${arg.type}${arg.subtype ? "/" + arg.subtype : ""}]`;
        return "[Object]";
      }
      return arg;
    });
    safeError(...safeArgs);
  } catch (error: any) {
    // Silently ignore EPIPE and other console errors
    if (error.code !== "EPIPE") {
      try {
        process.stderr.write(`Console error: ${error.message}\n`);
      } catch {
        // Even stderr might fail, just ignore
      }
    }
  }
}

// WorkspaceData is the persisted data stored in session.json
export interface WorkspaceData {
  sessionId: string;
  history: SDKMessage[];
  permissionMode?: UIPermissionMode;
}

// Workspace is the in-memory representation with runtime associations
export interface Workspace extends WorkspaceData {
  id: string; // Format: <projectName>-<branch>
  projectName: string;
  branch: string;
  srcPath: string; // Path to the git worktree (source code)
  sessionPath: string; // Path to the session data directory
  query: Query | null;
  isActive: boolean;
  messageController: MessageController | null;
  // Inherited from WorkspaceData: sessionId, history, permissionMode
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

// Helper functions for permission mode conversion
function uiToSDKPermissionMode(mode: UIPermissionMode): SDKPermissionMode {
  switch (mode) {
    case 'plan':
      return 'plan';
    case 'edit':
      return 'acceptEdits';
    case 'yolo':
      return 'bypassPermissions';
    default:
      return 'default';
  }
}

export class ClaudeService extends EventEmitter {
  private workspaces: Map<string, Workspace> = new Map();
  private configDir: string;
  private sdkLoaded: boolean = false;

  constructor() {
    super();
    this.configDir = path.join(os.homedir(), ".cmux");
    // Load SDK asynchronously without blocking constructor
    this.loadSDK().catch((error) => {
      safeError("Failed to initialize Claude SDK:", error);
    });
  }

  private async loadSDK(): Promise<void> {
    if (this.sdkLoaded) return;

    try {
      // Use Function constructor to ensure true dynamic import
      const dynamicImport = new Function(
        "specifier",
        "return import(specifier)"
      );
      const claudeModule = await dynamicImport("@anthropic-ai/claude-code");
      queryFunction = claudeModule.query;
      this.sdkLoaded = true;
      safeLog("Claude Code SDK loaded successfully");
    } catch (error) {
      safeError("Failed to load Claude Code SDK:", error);
      throw error;
    }
  }

  private getWorkspaceId(projectName: string, branch: string): string {
    return `${projectName}-${branch}`;
  }

  private getWorkspaceDir(workspaceId: string): string {
    return path.join(this.configDir, "workspaces", workspaceId);
  }

  private getMetadataFile(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), "metadata.json");
  }

  private getHistoryFile(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), "chat_history.ndjson");
  }

  private async loadMetadata(workspaceId: string): Promise<{ sessionId: string; permissionMode?: UIPermissionMode }> {
    try {
      const metadataFile = this.getMetadataFile(workspaceId);
      const data = await fs.readFile(metadataFile, "utf-8");
      return JSON.parse(data);
    } catch {
      // File doesn't exist, return defaults
      return {
        sessionId: crypto.randomUUID(),
        permissionMode: 'plan'
      };
    }
  }

  private async saveMetadata(
    workspaceId: string,
    metadata: { sessionId: string; permissionMode?: UIPermissionMode }
  ): Promise<void> {
    try {
      const metadataFile = this.getMetadataFile(workspaceId);
      const dir = path.dirname(metadataFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    } catch (error) {
      safeError(`Failed to save metadata for ${workspaceId}:`, error);
    }
  }

  private async appendMessage(
    workspaceId: string,
    message: SDKMessage
  ): Promise<void> {
    try {
      const historyFile = this.getHistoryFile(workspaceId);
      const dir = path.dirname(historyFile);
      await fs.mkdir(dir, { recursive: true });
      // Append as NDJSON (newline-delimited JSON)
      await fs.appendFile(historyFile, JSON.stringify(message) + "\n");
    } catch (error) {
      safeError(`Failed to append message for ${workspaceId}:`, error);
    }
  }

  private async *streamHistoricalMessages(
    workspaceId: string
  ): AsyncIterable<SDKMessage> {
    try {
      const historyFile = this.getHistoryFile(workspaceId);
      safeLog(`[${workspaceId}] Reading history from: ${historyFile}`);
      const content = await fs.readFile(historyFile, "utf-8");
      const lines = content.split("\n").filter(line => line.trim());
      safeLog(`[${workspaceId}] Found ${lines.length} lines in history file`);
      
      for (const line of lines) {
        try {
          yield JSON.parse(line);
        } catch (error) {
          safeError(`Failed to parse NDJSON line:`, error);
        }
      }
    } catch (error) {
      safeLog(`[${workspaceId}] No history file found or error reading: ${error}`);
    }
  }

  private async clearHistory(workspaceId: string): Promise<void> {
    try {
      const historyFile = this.getHistoryFile(workspaceId);
      await fs.writeFile(historyFile, "");
    } catch (error) {
      safeError(`Failed to clear history for ${workspaceId}:`, error);
    }
  }

  private async loadRecentHistory(
    workspaceId: string,
    limit: number = 100
  ): Promise<SDKMessage[]> {
    const messages: SDKMessage[] = [];
    for await (const message of this.streamHistoricalMessages(workspaceId)) {
      messages.push(message);
    }
    // Return only the last N messages for SDK resume
    return messages.slice(-limit);
  }

  async startWorkspace(
    srcPath: string, // This is the git worktree path
    projectName: string,
    branch: string,
    permissionMode?: UIPermissionMode
  ): Promise<{ success: boolean; workspaceId?: string }> {
    // Ensure SDK is loaded
    await this.loadSDK();

    if (!queryFunction) {
      safeError("Claude Code SDK not loaded");
      return { success: false };
    }

    const key = this.getWorkspaceId(projectName, branch);

    // Check if already running
    const existing = this.workspaces.get(key);
    if (existing?.isActive) {
      safeLog(`Workspace ${key} is already active`);
      return { success: true, workspaceId: key };
    }

    try {
      // Load metadata (session ID + permission mode)
      const metadata = await this.loadMetadata(key);
      
      // Load recent history for SDK resume
      const recentHistory = await this.loadRecentHistory(key, 100);

      // Use stored permission mode if not explicitly provided
      const effectivePermissionMode = permissionMode ?? metadata.permissionMode ?? 'plan';
      safeLog(`[${key}] Loaded workspace data:`, {
        sessionId: metadata.sessionId,
        historyLength: recentHistory.length,
        isResuming: recentHistory.length > 0,
      });

      // Create message controller for streaming input
      const messageController = new MessageController();

      // Calculate session path for storing session.json
      const sessionPath = path.join(this.configDir, "workspaces", key);

      const session: Workspace = {
        id: key,
        projectName,
        branch,
        srcPath, // Git worktree path (source code)
        sessionPath, // Session data directory
        sessionId: metadata.sessionId,
        history: [...recentHistory], // Keep recent history for SDK resume
        permissionMode: effectivePermissionMode,
        query: null,
        isActive: true,
        messageController,
      };

      // Configure options for the SDK
      const sdkPermissionMode = uiToSDKPermissionMode(effectivePermissionMode);
      safeLog(`[${key}] Starting workspace with permission mode: UI=${effectivePermissionMode}, SDK=${sdkPermissionMode}`);
      
      const options: Options = {
        cwd: srcPath, // Use source path as working directory
        permissionMode: sdkPermissionMode,
        // Use resume for existing sessions
        resume:
          recentHistory.length > 0
            ? metadata.sessionId
            : undefined,
        continue: recentHistory.length > 0,
        // Enable partial messages for streaming
        includePartialMessages: true,
      };

      // Start the query using streaming input mode (no initial message)
      session.query = queryFunction({
        prompt: messageController.getAsyncIterable(),
        options,
      });

      this.workspaces.set(key, session);
      safeLog(`[${key}] Workspace started successfully and added to map`);

      // Save metadata for future restarts
      await this.saveMetadata(key, {
        sessionId: session.sessionId,
        permissionMode: effectivePermissionMode,
      });

      // Stream output in the background
      this.streamOutput(key, session);

      return { success: true, workspaceId: key };
    } catch (error) {
      safeError(`Failed to start workspace ${key}:`, error);
      return { success: false };
    }
  }

  private async streamOutput(key: string, session: Workspace): Promise<void> {
    if (!session.query) return;

    try {
      for await (const message of session.query) {
        // Check if still active
        if (!session.isActive) {
          break;
        }

        // Add sequence number for ordering
        const messageWithSequence = {
          ...message,
          _sequenceNumber: session.history.length,
        };
        
        // Keep recent messages in memory for SDK resume
        session.history.push(messageWithSequence);
        // Limit in-memory history to last 100 messages
        if (session.history.length > 100) {
          session.history = session.history.slice(-100);
        }

        // Append to NDJSON file
        await this.appendMessage(key, messageWithSequence);

        // If this is the first system/init message, use Claude's session ID for future resumes
        if (
          message.type === "system" &&
          message.subtype === "init" &&
          message.session_id
        ) {
          session.sessionId = message.session_id;
          safeLog(
            `[${key}] Updated session ID to Claude's ID:`,
            message.session_id
          );
          
          // Update metadata with new session ID
          await this.saveMetadata(key, {
            sessionId: session.sessionId,
            permissionMode: session.permissionMode,
          });
        }

        // Debug logging to see what messages we're receiving
        safeLog(`[${key}] Received message:`, {
          type: message.type,
          subtype: message.subtype,
          uuid: message.uuid,
          hasMessage: !!message.message,
          messageRole: message.message?.role,
        });

        // Emit output event on workspace-specific channel
        this.emit("workspace-output", key, {
          message: messageWithSequence
        });
      }
    } catch (error) {
      safeError(`Error streaming output for ${key}:`, error);
      session.isActive = false;
    }
  }

  async sendMessage(
    projectName: string,
    branch: string,
    message: string
  ): Promise<Result<void, string>> {
    const key = this.getWorkspaceId(projectName, branch);
    let session = this.workspaces.get(key);

    // Auto-start workspace if not active
    if (!session || !session.isActive || !session.messageController) {
      safeLog(`Auto-starting workspace ${key}...`);

      // Get workspace path from config
      const srcPath = findWorkspacePath(projectName, branch);

      if (!srcPath) {
        const error = `Cannot find workspace path for ${key}. Workspace not configured in ~/.cmux/config.json`;
        safeError(error);
        return Err(error);
      }

      // Start the workspace (will use saved plan mode)
      const result = await this.startWorkspace(srcPath, projectName, branch);
      if (!result.success) {
        const error = `Failed to auto-start workspace ${key}. Check that Claude Code SDK is installed and the workspace path is valid`;
        safeError(error);
        return Err(error);
      }

      // Get the session again after starting
      session = this.workspaces.get(key);
      if (!session) {
        const error = `Workspace ${key} not found after starting. Internal error in workspace management`;
        safeError(error);
        return Err(error);
      }
    }

    try {
      // Create SDK user message with sequence-based ordering
      const userMessage = {
        type: "user",
        session_id: session.sessionId,
        message: {
          role: "user",
          content: message,
        },
        parent_tool_use_id: null,
        uuid: `user-${Date.now()}-${Math.random()}`, // Generate UUID for deduplication
        _sequenceNumber: session.history.length, // Use current length as sequence for ordering
        timestamp: Date.now(),
      };

      // Send message through the controller
      // Avoid safeLog of large objects to prevent EPIPE errors
      if (session.messageController) {
        session.messageController.sendMessage(userMessage);
      } else {
        const error =
          "Message controller is null. Workspace may not be properly initialized";
        safeError(error);
        return Err(error);
      }

      // Also store the user message in our local history for SDK
      session.history.push(userMessage);
      // Limit in-memory history to last 100 messages
      if (session.history.length > 100) {
        session.history = session.history.slice(-100);
      }

      // Append to NDJSON history
      await this.appendMessage(key, userMessage);

      // Emit the user message locally so it appears in UI immediately
      this.emit("workspace-output", key, {
        message: userMessage
      });

      return Ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const detailedError = `Failed to send message to workspace ${key}: ${errorMessage}. Check workspace status and try again`;

      safeError(`Failed to send message to ${key}:`, {
        error,
        key,
        projectName,
        branch,
        message,
        sessionExists: !!session,
        sessionActive: session?.isActive,
        hasController: !!session?.messageController,
      });
      return Err(detailedError);
    }
  }

  async handleSlashCommand(
    projectName: string,
    branch: string,
    command: string
  ): Promise<Result<void, string>> {
    const key = this.getWorkspaceId(projectName, branch);
    const commandLower = command.toLowerCase().trim();

    // Handle /clear command specially - just clear the session data
    if (commandLower === "/clear") {
      try {
        safeLog(`[${key}] Executing /clear command`);

        // Get the current workspace session
        const currentSession = this.workspaces.get(key);
        if (!currentSession) {
          const error = `No workspace session found for ${key}. Workspace may not be started`;
          safeError(error);
          return Err(error);
        }

        // Clear the session's in-memory history
        currentSession.history = [];

        // Generate new session ID for a fresh start
        const newSessionId = crypto.randomUUID();
        currentSession.sessionId = newSessionId;

        // Clear the NDJSON history file
        await this.clearHistory(key);
        
        // Update metadata with new session ID
        await this.saveMetadata(key, {
          sessionId: newSessionId,
          permissionMode: currentSession.permissionMode,
        });

        // Emit a clear event on workspace-specific channel
        this.emit("workspace-clear", key, {});

        safeLog(`[${key}] Session cleared successfully`);
        return Ok(undefined);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const detailedError = `Failed to execute /clear command for workspace ${key}: ${errorMessage}`;
        safeError(`Failed to execute /clear for ${key}:`, error);
        return Err(detailedError);
      }
    }

    // For other slash commands, pass them through to the SDK
    // The SDK will handle them internally
    return this.sendMessage(projectName, branch, command);
  }


  async getWorkspaceInfo(
    projectName: string,
    branch: string
  ): Promise<{ permissionMode: UIPermissionMode }> {
    const key = this.getWorkspaceId(projectName, branch);
    const session = this.workspaces.get(key);

    // If session exists in memory, return its permission mode
    if (session) {
      return { permissionMode: session.permissionMode ?? 'plan' };
    }

    // Otherwise, load from metadata
    try {
      const metadata = await this.loadMetadata(key);
      return { permissionMode: metadata.permissionMode ?? 'plan' };
    } catch {
      return { permissionMode: 'plan' };
    }
  }

  async setPermissionMode(
    projectName: string,
    branch: string,
    permissionMode: UIPermissionMode
  ): Promise<void> {
    const key = this.getWorkspaceId(projectName, branch);
    safeLog(`[${key}] setPermissionMode called with: ${permissionMode}`);
    const session = this.workspaces.get(key);

    // Update in-memory session if it exists
    if (session) {
      session.permissionMode = permissionMode;

      // Update SDK permission mode if query is active
      if (session.query) {
        const sdkMode = uiToSDKPermissionMode(permissionMode);
        safeLog(`[${key}] Attempting to update permission mode: UI=${permissionMode}, SDK=${sdkMode}`);
        
        if (typeof session.query.setPermissionMode === 'function') {
          try {
            await session.query.setPermissionMode(sdkMode);
            safeLog(`[${key}] Successfully updated permission mode to ${permissionMode} (${sdkMode})`);
          } catch (error) {
            safeError(`[${key}] Failed to update permission mode:`, error);
          }
        } else {
          safeLog(`[${key}] Warning: setPermissionMode method not available on query object. Permission mode saved but may not take effect until restart.`);
        }
      } else {
        safeLog(`[${key}] No active query, permission mode saved to disk only`);
      }
    } else {
      safeLog(`[${key}] No session found, permission mode will be saved to disk only`);
    }

    // Always persist to metadata (without touching history)
    const metadata = await this.loadMetadata(key);
    await this.saveMetadata(key, {
      sessionId: metadata.sessionId,
      permissionMode
    });
  }

  isWorkspaceActive(projectName: string, branch: string): boolean {
    const key = this.getWorkspaceId(projectName, branch);
    const session = this.workspaces.get(key);
    const isActive = session?.isActive || false;
    safeLog(
      `[${key}] isWorkspaceActive check: found=${!!session}, isActive=${isActive}`
    );
    return isActive;
  }

  async streamWorkspaceHistory(projectName: string, branch: string): Promise<void> {
    const key = this.getWorkspaceId(projectName, branch);
    safeLog(`[${key}] Starting to stream workspace history`);
    
    let messageCount = 0;
    // Stream historical messages to frontend
    for await (const message of this.streamHistoricalMessages(key)) {
      messageCount++;
      this.emit("workspace-output", key, {
        message,
        historical: true
      });
    }
    
    safeLog(`[${key}] Streamed ${messageCount} historical messages`);

    // Send caught-up signal
    this.emit("workspace-output", key, {
      caughtUp: true
    });
  }

  // Helper method to parse workspaceId into projectName and branch
  private parseWorkspaceId(workspaceId: string): { projectName: string; branch: string } {
    const lastDashIndex = workspaceId.lastIndexOf('-');
    if (lastDashIndex === -1) {
      throw new Error(`Invalid workspaceId format: ${workspaceId}`);
    }
    return {
      projectName: workspaceId.substring(0, lastDashIndex),
      branch: workspaceId.substring(lastDashIndex + 1)
    };
  }


  // New methods that accept workspaceId directly
  async sendMessageById(workspaceId: string, message: string): Promise<Result<void, string>> {
    const { projectName, branch } = this.parseWorkspaceId(workspaceId);
    return this.sendMessage(projectName, branch, message);
  }

  async handleSlashCommandById(workspaceId: string, command: string): Promise<Result<void, string>> {
    const { projectName, branch } = this.parseWorkspaceId(workspaceId);
    return this.handleSlashCommand(projectName, branch, command);
  }

  async getWorkspaceInfoById(workspaceId: string): Promise<{ permissionMode: UIPermissionMode }> {
    const { projectName, branch } = this.parseWorkspaceId(workspaceId);
    return this.getWorkspaceInfo(projectName, branch);
  }

  async setPermissionModeById(workspaceId: string, permissionMode: UIPermissionMode): Promise<void> {
    const { projectName, branch } = this.parseWorkspaceId(workspaceId);
    return this.setPermissionMode(projectName, branch, permissionMode);
  }

  isWorkspaceActiveById(workspaceId: string): boolean {
    const { projectName, branch } = this.parseWorkspaceId(workspaceId);
    return this.isWorkspaceActive(projectName, branch);
  }

  async streamWorkspaceHistoryById(workspaceId: string): Promise<void> {
    const { projectName, branch } = this.parseWorkspaceId(workspaceId);
    return this.streamWorkspaceHistory(projectName, branch);
  }

  list(): Array<Partial<Workspace>> {
    const workspaces = [];

    for (const [, session] of this.workspaces) {
      // Return a simplified version without runtime objects like query/messageController
      workspaces.push({
        id: session.id,
        projectName: session.projectName,
        branch: session.branch,
        srcPath: session.srcPath,
        sessionPath: session.sessionPath,
        sessionId: session.sessionId,
        permissionMode: session.permissionMode,
        isActive: session.isActive,
      });
    }

    return workspaces;
  }

  async autoStartAllWorkspaces(
    projects: Map<
      string,
      { path: string; workspaces: Array<{ branch: string; path: string }> }
    >
  ): Promise<void> {
    const startPromises = [];

    for (const [projectPath, project] of projects) {
      const projectName =
        projectPath.split("/").pop() ||
        projectPath.split("\\").pop() ||
        "unknown";

      for (const workspace of project.workspaces) {
        startPromises.push(
          this.startWorkspace(workspace.path, projectName, workspace.branch)
        );
      }
    }

    const results = await Promise.all(startPromises);
    const successCount = results.filter((r) => r.success).length;

    safeLog(
      `Started ${successCount} out of ${startPromises.length} workspaces`
    );
  }
}

// Export singleton instance
export default new ClaudeService();

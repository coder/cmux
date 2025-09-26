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

  private getWorkspaceFile(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), "session.json");
  }

  private async loadWorkspaceData(workspaceId: string): Promise<WorkspaceData> {
    try {
      const workspaceFile = this.getWorkspaceFile(workspaceId);
      const data = await fs.readFile(workspaceFile, "utf-8");
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
      history: [],
    };
  }

  private async saveWorkspaceData(
    workspaceId: string,
    data: WorkspaceData
  ): Promise<void> {
    try {
      const workspaceFile = this.getWorkspaceFile(workspaceId);
      const dir = path.dirname(workspaceFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(workspaceFile, JSON.stringify(data, null, 2));
    } catch (error) {
      safeError(`Failed to save workspace data for ${workspaceId}:`, error);
    }
  }

  private async updateWorkspaceData(
    workspaceId: string,
    updates: Partial<WorkspaceData>
  ): Promise<void> {
    try {
      // Load current data
      const currentData = await this.loadWorkspaceData(workspaceId);
      // Merge updates
      const updatedData = { ...currentData, ...updates };
      // Save back
      await this.saveWorkspaceData(workspaceId, updatedData);
    } catch (error) {
      safeError(`Failed to update workspace data for ${workspaceId}:`, error);
    }
  }

  async startWorkspace(
    srcPath: string, // This is the git worktree path
    projectName: string,
    branch: string,
    permissionMode?: UIPermissionMode
  ): Promise<boolean> {
    // Ensure SDK is loaded
    await this.loadSDK();

    if (!queryFunction) {
      safeError("Claude Code SDK not loaded");
      return false;
    }

    const key = this.getWorkspaceId(projectName, branch);

    // Check if already running
    const existing = this.workspaces.get(key);
    if (existing?.isActive) {
      safeLog(`Workspace ${key} is already active`);
      return false;
    }

    try {
      // Load workspace data (session ID + history)
      const workspaceData = await this.loadWorkspaceData(key);

      // Use stored plan mode if not explicitly provided
      const effectivePermissionMode = permissionMode ?? workspaceData.permissionMode ?? 'plan';
      safeLog(`[${key}] Loaded workspace data:`, {
        sessionId: workspaceData.sessionId,
        historyLength: workspaceData.history.length,
        isResuming: workspaceData.history.length > 0,
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
        sessionId: workspaceData.sessionId,
        history: [...workspaceData.history], // Restore previous conversation history
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
          workspaceData.history.length > 0
            ? workspaceData.sessionId
            : undefined,
        continue: workspaceData.history.length > 0,
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

      // Save workspace data (session ID + history + permissionMode) for future restarts
      await this.saveWorkspaceData(key, {
        sessionId: session.sessionId,
        history: session.history,
        permissionMode: effectivePermissionMode,
      });

      // Stream output in the background
      this.streamOutput(key, session);

      return true;
    } catch (error) {
      safeError(`Failed to start workspace ${key}:`, error);
      return false;
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

        // Add sequence number for ordering and store output
        const messageWithSequence = {
          ...message,
          _sequenceNumber: session.history.length,
        };
        session.history.push(messageWithSequence);

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
        }

        // Check for compaction completion message
        if (
          message.type === "user" &&
          message.message?.content &&
          typeof message.message.content === "string" &&
          message.message.content.includes(
            "<local-command-stdout>Compacted</local-command-stdout>"
          )
        ) {
          safeLog(`[${key}] Detected compaction completion, clearing history`);

          // Find the index of this compacted message
          const compactedMsgIndex = session.history.findIndex(
            (m: any) => m.uuid === message.uuid
          );

          // Keep only messages from compacted message onwards
          if (compactedMsgIndex >= 0) {
            session.history = session.history.slice(compactedMsgIndex);
            // Reset sequence numbers
            session.history.forEach((msg: any, index: number) => {
              msg._sequenceNumber = index;
            });
          }

          // Save cleaned history
          await this.saveWorkspaceData(key, {
            sessionId: session.sessionId,
            history: session.history,
            permissionMode: session.permissionMode,
          });

          // Emit compaction-complete event
          this.emit("compaction-complete", {
            workspace: key,
            projectName: session.projectName,
            branch: session.branch,
          });
        } else {
          // Normal save for non-compaction messages
          await this.saveWorkspaceData(key, {
            sessionId: session.sessionId,
            history: session.history,
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

        // Emit output event
        this.emit("output", {
          workspace: key,
          message: messageWithSequence,
          projectName: session.projectName,
          branch: session.branch,
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
      const started = await this.startWorkspace(srcPath, projectName, branch);
      if (!started) {
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

      // Also store the user message in our local output for persistence
      session.history.push(userMessage);

      // Save conversation history to disk
      await this.saveWorkspaceData(key, {
        sessionId: session.sessionId,
        history: session.history,
        permissionMode: session.permissionMode,
      });

      // Emit the user message locally so it appears in UI immediately
      this.emit("output", {
        workspace: key,
        message: userMessage,
        projectName: session.projectName,
        branch: session.branch,
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

        // Clear the session's output history
        currentSession.history = [];

        // Generate new session ID for a fresh start
        const newSessionId = crypto.randomUUID();
        currentSession.sessionId = newSessionId;

        // Clear the persisted history but keep permissionMode
        await this.saveWorkspaceData(key, {
          sessionId: newSessionId,
          history: [],
          permissionMode: currentSession.permissionMode,
        });

        // Emit a clear event so UI can update
        this.emit("clear", {
          workspace: key,
          projectName,
          branch,
        });

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

  getWorkspaceOutput(projectName: string, branch: string): SDKMessage[] {
    const key = this.getWorkspaceId(projectName, branch);
    const session = this.workspaces.get(key);
    return session?.history || [];
  }

  async getWorkspaceInfo(
    projectName: string,
    branch: string
  ): Promise<{ permissionMode: UIPermissionMode }> {
    const key = this.getWorkspaceId(projectName, branch);
    const session = this.workspaces.get(key);

    // If session exists in memory, return its plan mode
    if (session) {
      return { permissionMode: session.permissionMode ?? 'plan' };
    }

    // Otherwise, load from disk
    try {
      const workspaceData = await this.loadWorkspaceData(key);
      return { permissionMode: workspaceData.permissionMode ?? 'plan' };
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

    // Always persist to disk (efficiently, without rewriting history)
    await this.updateWorkspaceData(key, { permissionMode });
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
    const successCount = results.filter((r) => r === true).length;

    safeLog(
      `Started ${successCount} out of ${startPromises.length} workspaces`
    );
  }
}

// Export singleton instance
export default new ClaudeService();

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { EventEmitter } from "events";
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

// Simple interface for workspace info returned to frontend
export interface WorkspaceInfo {
  id: string;
  projectName: string;
  branch: string;
  srcPath: string;
  permissionMode?: UIPermissionMode;
  isActive?: boolean;
}

// Message queue for streaming input to Claude
class MessageQueue {
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

// Active query for each workspace
interface ActiveQuery {
  query: Query;
  messageQueue: MessageQueue;
  sessionId: string;
  permissionMode: UIPermissionMode;
  sequenceCounter: number;  // Track next sequence number for messages
}

// Message type that guarantees cmuxMeta is present
interface MessageWithCmuxMeta extends SDKMessage {
  metadata: {
    cmuxMeta: {
      permissionMode: UIPermissionMode;
      sequenceNumber: number;
    };
  };
}

export class ClaudeService extends EventEmitter {
  private queries: Map<string, ActiveQuery> = new Map();
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

  private getWorkspaceDir(workspaceId: string): string {
    return path.join(this.configDir, "workspaces", workspaceId);
  }

  private getMetadataFile(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), "metadata.json");
  }

  private getHistoryFile(workspaceId: string): string {
    return path.join(this.getWorkspaceDir(workspaceId), "chat_history.ndjson");
  }

  private async loadMetadata(workspaceId: string): Promise<{
    sessionId: string;
    permissionMode?: UIPermissionMode;
    projectName?: string;
    branch?: string;
    workspacePath?: string;
    nextSequenceNumber?: number;
  }> {
    try {
      const metadataFile = this.getMetadataFile(workspaceId);
      const data = await fs.readFile(metadataFile, "utf-8");
      return JSON.parse(data);
    } catch {
      // File doesn't exist, workspace not initialized
      throw new Error(`Workspace ${workspaceId} not initialized. Metadata file not found.`);
    }
  }

  private async updateMetadata(
    workspaceId: string,
    updater: (metadata: {
      sessionId: string;
      permissionMode?: UIPermissionMode;
      projectName?: string;
      branch?: string;
      workspacePath?: string;
      nextSequenceNumber?: number;
    }) => void
  ): Promise<void> {
    try {
      // Load existing metadata or create default
      let metadata: {
        sessionId: string;
        permissionMode?: UIPermissionMode;
        projectName?: string;
        branch?: string;
        workspacePath?: string;
        nextSequenceNumber?: number;
      };
      
      try {
        metadata = await this.loadMetadata(workspaceId);
      } catch {
        // If metadata doesn't exist, start with minimal defaults
        metadata = {
          sessionId: crypto.randomUUID(),
          permissionMode: 'plan'
        };
      }
      
      // Apply the update
      updater(metadata);
      
      // Save the updated metadata
      const metadataFile = this.getMetadataFile(workspaceId);
      const dir = path.dirname(metadataFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    } catch (error) {
      safeError(`Failed to update metadata for ${workspaceId}:`, error);
    }
  }

  // Initialize a new workspace with complete metadata
  async initializeWorkspace(
    workspaceId: string,
    projectName: string,
    branch: string,
    workspacePath: string
  ): Promise<void> {
    await this.updateMetadata(workspaceId, (metadata) => {
      // Set all required fields for a new workspace
      metadata.sessionId = crypto.randomUUID();
      metadata.permissionMode = 'plan';
      metadata.projectName = projectName;
      metadata.branch = branch;
      metadata.workspacePath = workspacePath;
      metadata.nextSequenceNumber = 0;  // Start sequence numbering at 0
    });
  }

  private async appendMessage(
    workspaceId: string,
    message: MessageWithCmuxMeta
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

  // Get or create a query for the workspace
  private async getOrCreateQuery(
    workspaceId: string
  ): Promise<ActiveQuery> {
    // Check if query already exists
    let activeQuery = this.queries.get(workspaceId);
    if (activeQuery) {
      return activeQuery;
    }

    // Ensure SDK is loaded
    await this.loadSDK();
    if (!queryFunction) {
      throw new Error("Claude Code SDK not loaded");
    }

    // CRITICAL: Check again after await - another call might have created it
    activeQuery = this.queries.get(workspaceId);
    if (activeQuery) {
      return activeQuery;
    }

    // Load complete metadata (includes workspacePath)
    const metadata = await this.loadMetadata(workspaceId);
    if (!metadata.workspacePath) {
      throw new Error(`Workspace ${workspaceId} not properly initialized - missing workspacePath`);
    }
    
    // Check once more after loading metadata
    activeQuery = this.queries.get(workspaceId);
    if (activeQuery) {
      return activeQuery;
    }
    
    const permissionMode = metadata.permissionMode ?? 'plan';
    
    // Load recent history for SDK resume
    const recentHistory = await this.loadRecentHistory(workspaceId, 100);
    
    // Use persisted sequence number from metadata (or 0 if not set)
    const startingSequence = metadata.nextSequenceNumber ?? 0;

    // Create message queue for streaming input
    const messageQueue = new MessageQueue();

    // Configure options for the SDK
    const sdkPermissionMode = uiToSDKPermissionMode(permissionMode);
    safeLog(`[${workspaceId}] Creating query with permission mode: UI=${permissionMode}, SDK=${sdkPermissionMode}`);
    
    const options: Options = {
      cwd: metadata.workspacePath,
      permissionMode: sdkPermissionMode,
      resume: recentHistory.length > 0 ? metadata.sessionId : undefined,
      continue: recentHistory.length > 0,
      includePartialMessages: true,
    };

    // Start the query using streaming input mode
    const query = queryFunction({
      prompt: messageQueue.getAsyncIterable(),
      options,
    });

    // Create active query object
    activeQuery = {
      query,
      messageQueue,
      sessionId: metadata.sessionId,
      permissionMode,
      sequenceCounter: startingSequence,  // Continue from last message
    };

    this.queries.set(workspaceId, activeQuery);
    safeLog(`[${workspaceId}] Query created and stored`);

    // Stream output in the background
    this.streamOutput(workspaceId, activeQuery);

    return activeQuery;
  }

  private async streamOutput(workspaceId: string, activeQuery: ActiveQuery): Promise<void> {
    try {
      for await (const message of activeQuery.query) {
        // Get next sequence number and increment counter
        const sequenceNumber = activeQuery.sequenceCounter++;
        
        // Add sequence number and cmuxMeta for ordering and permission tracking
        const messageWithMetadata: MessageWithCmuxMeta = {
          ...message,
          // Keep SDK's _sequenceNumber unchanged
          metadata: {
            ...message.metadata,
            cmuxMeta: {
              permissionMode: activeQuery.permissionMode,
              sequenceNumber: sequenceNumber
            }
          }
        };

        // Append to NDJSON file
        await this.appendMessage(workspaceId, messageWithMetadata);
        
        // CRITICAL: Always persist the updated sequence counter
        // The metadata file is small and writes are cheap.
        // This ensures we NEVER lose sequence numbers, even on crashes.
        // Without this, concurrent operations could duplicate sequences.
        await this.updateMetadata(workspaceId, (metadata) => {
          metadata.nextSequenceNumber = activeQuery.sequenceCounter;
        });

        // If this is the first system/init message, use Claude's session ID for future resumes
        if (
          message.type === "system" &&
          message.subtype === "init" &&
          message.session_id
        ) {
          activeQuery.sessionId = message.session_id;
          safeLog(
            `[${workspaceId}] Updated session ID to Claude's ID:`,
            message.session_id
          );
          
          // Update metadata with new session ID
          await this.updateMetadata(workspaceId, (metadata) => {
            metadata.sessionId = activeQuery.sessionId;
            metadata.permissionMode = activeQuery.permissionMode;
          });
        }

        // Debug logging to see what messages we're receiving
        safeLog(`[${workspaceId}] Received message:`, {
          type: message.type,
          subtype: message.subtype,
          uuid: message.uuid,
          hasMessage: !!message.message,
          messageRole: message.message?.role,
        });

        // Emit output event on workspace-specific channel
        this.emit("workspace-output", workspaceId, {
          message: messageWithMetadata
        });
      }
      
      // Always persist the final sequence counter when stream ends
      await this.updateMetadata(workspaceId, (metadata) => {
        metadata.nextSequenceNumber = activeQuery.sequenceCounter;
      });
    } catch (error) {
      safeError(`Error streaming output for ${workspaceId}:`, error);
      
      // Try to persist the current sequence counter even on error
      try {
        await this.updateMetadata(workspaceId, (metadata) => {
          metadata.nextSequenceNumber = activeQuery.sequenceCounter;
        });
      } catch {
        // Ignore metadata update errors during error handling
      }
      
      // Remove the query on error
      this.queries.delete(workspaceId);
    }
  }

  async sendMessageById(
    workspaceId: string,
    message: string
  ): Promise<Result<void, string>> {
    try {
      // Get or create query for this workspace
      const activeQuery = await this.getOrCreateQuery(workspaceId);
      
      // Get next sequence number and increment counter
      const sequenceNumber = activeQuery.sequenceCounter++;

      // Create SDK user message with cmuxMeta
      const userMessage: MessageWithCmuxMeta = {
        type: "user",
        session_id: activeQuery.sessionId,
        message: {
          role: "user",
          content: message,
        },
        parent_tool_use_id: null,
        uuid: `user-${Date.now()}-${Math.random()}`,
        // Don't set _sequenceNumber - let SDK handle it
        timestamp: Date.now(),
        metadata: {
          cmuxMeta: {
            permissionMode: activeQuery.permissionMode,
            sequenceNumber: sequenceNumber
          }
        }
      };

      // Send message through the queue (without metadata for SDK)
      const { metadata, ...sdkMessage } = userMessage;
      activeQuery.messageQueue.sendMessage(sdkMessage);

      // Append to NDJSON history (with metadata)
      await this.appendMessage(workspaceId, userMessage);
      
      // Persist the updated sequence counter for user messages
      await this.updateMetadata(workspaceId, (metadata) => {
        metadata.nextSequenceNumber = activeQuery.sequenceCounter;
      });

      // Emit the user message locally so it appears in UI immediately
      this.emit("workspace-output", workspaceId, {
        message: userMessage
      });

      return Ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const detailedError = `Failed to send message to workspace ${workspaceId}: ${errorMessage}`;
      safeError(`Failed to send message to ${workspaceId}:`, error);
      return Err(detailedError);
    }
  }

  async handleSlashCommandById(
    workspaceId: string,
    command: string
  ): Promise<Result<void, string>> {
    const commandLower = command.toLowerCase().trim();

    // Handle /clear command specially - just clear the session data
    if (commandLower === "/clear") {
      try {
        safeLog(`[${workspaceId}] Executing /clear command`);

        // Remove active query if it exists
        const activeQuery = this.queries.get(workspaceId);
        if (activeQuery) {
          activeQuery.messageQueue.close();
          this.queries.delete(workspaceId);
        }

        // Generate new session ID for a fresh start
        const newSessionId = crypto.randomUUID();

        // Clear the NDJSON history file
        await this.clearHistory(workspaceId);
        
        // Update metadata with new session ID and reset sequence counter
        await this.updateMetadata(workspaceId, (metadata) => {
          metadata.sessionId = newSessionId;
          metadata.nextSequenceNumber = 0;  // Reset sequence counter on clear
        });

        // Emit a clear event on workspace-specific channel
        this.emit("workspace-clear", workspaceId, {});

        safeLog(`[${workspaceId}] Session cleared successfully`);
        return Ok(undefined);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const detailedError = `Failed to execute /clear command for workspace ${workspaceId}: ${errorMessage}`;
        safeError(`Failed to execute /clear for ${workspaceId}:`, error);
        return Err(detailedError);
      }
    }

    // For other slash commands, pass them through to the SDK
    return this.sendMessageById(workspaceId, command);
  }


  async getWorkspaceInfoById(
    workspaceId: string
  ): Promise<{ permissionMode: UIPermissionMode }> {
    // Check if query exists and has current permission mode
    const activeQuery = this.queries.get(workspaceId);
    if (activeQuery) {
      return { permissionMode: activeQuery.permissionMode };
    }

    // Otherwise, load from metadata
    try {
      const metadata = await this.loadMetadata(workspaceId);
      return { permissionMode: metadata.permissionMode ?? 'plan' };
    } catch {
      return { permissionMode: 'plan' };
    }
  }

  async setPermissionModeById(
    workspaceId: string,
    permissionMode: UIPermissionMode
  ): Promise<void> {
    safeLog(`[${workspaceId}] setPermissionMode called with: ${permissionMode}`);
    
    // Update active query if it exists
    const activeQuery = this.queries.get(workspaceId);
    if (activeQuery) {
      activeQuery.permissionMode = permissionMode;

      // Update SDK permission mode
      const sdkMode = uiToSDKPermissionMode(permissionMode);
      safeLog(`[${workspaceId}] Attempting to update permission mode: UI=${permissionMode}, SDK=${sdkMode}`);
      
      // Check if setPermissionMode is available
      safeLog(`[${workspaceId}] Checking setPermissionMode availability...`);
      safeLog(`[${workspaceId}] query type: ${typeof activeQuery.query}`);
      safeLog(`[${workspaceId}] setPermissionMode type: ${typeof activeQuery.query.setPermissionMode}`);
      
      if (typeof activeQuery.query.setPermissionMode === 'function') {
        try {
          safeLog(`[${workspaceId}] Calling setPermissionMode(${sdkMode})...`);
          const result = await activeQuery.query.setPermissionMode(sdkMode);
          safeLog(`[${workspaceId}] setPermissionMode result:`, result);
          safeLog(`[${workspaceId}] Successfully updated permission mode to ${permissionMode} (${sdkMode})`);
        } catch (error) {
          safeError(`[${workspaceId}] Failed to update permission mode:`, error);
          // Log more details about the error
          if (error instanceof Error) {
            safeError(`[${workspaceId}] Error message: ${error.message}`);
            safeError(`[${workspaceId}] Error stack: ${error.stack}`);
          }
        }
      } else {
        safeLog(`[${workspaceId}] Warning: setPermissionMode method not available on query object.`);
        // Log available methods on the query object
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(activeQuery.query)).filter(
          prop => typeof (activeQuery.query as any)[prop] === 'function'
        );
        safeLog(`[${workspaceId}] Available methods on query:`, methods);
      }
    } else {
      safeLog(`[${workspaceId}] No active query, permission mode will be saved to disk only`);
    }

    // Always persist to metadata
    await this.updateMetadata(workspaceId, (metadata) => {
      metadata.permissionMode = permissionMode;
    });
  }

  isWorkspaceActiveById(workspaceId: string): boolean {
    // Simply check if a query exists for this workspace
    const hasQuery = this.queries.has(workspaceId);
    safeLog(`[${workspaceId}] isWorkspaceActive check: ${hasQuery}`);
    return hasQuery;
  }

  async streamWorkspaceHistoryById(workspaceId: string): Promise<void> {
    safeLog(`[${workspaceId}] Starting to stream workspace history`);
    
    let messageCount = 0;
    // Stream historical messages to frontend
    for await (const message of this.streamHistoricalMessages(workspaceId)) {
      messageCount++;
      this.emit("workspace-output", workspaceId, {
        message,
        historical: true
      });
    }
    
    safeLog(`[${workspaceId}] Streamed ${messageCount} historical messages`);

    // Send caught-up signal
    this.emit("workspace-output", workspaceId, {
      caughtUp: true
    });
  }




  async list(): Promise<Array<WorkspaceInfo>> {
    const workspaces: WorkspaceInfo[] = [];
    const workspacesDir = path.join(this.configDir, "workspaces");
    
    try {
      // Check if workspaces directory exists
      await fs.access(workspacesDir);
      
      // Read all workspace directories
      const dirs = await fs.readdir(workspacesDir);
      
      for (const workspaceId of dirs) {
        try {
          // Load complete metadata
          const metadata = await this.loadMetadata(workspaceId);
          
          // Skip if metadata is incomplete
          if (!metadata.projectName || !metadata.branch || !metadata.workspacePath) {
            safeLog(`Skipping incomplete workspace: ${workspaceId}`);
            continue;
          }
          
          // Check if query is active
          const isActive = this.queries.has(workspaceId);
          
          workspaces.push({
            id: workspaceId,
            projectName: metadata.projectName,
            branch: metadata.branch,
            srcPath: metadata.workspacePath,
            permissionMode: metadata.permissionMode ?? 'plan',
            isActive
          });
        } catch (error) {
          // Skip workspace directories without valid metadata
          safeLog(`Skipping workspace without metadata: ${workspaceId}`);
        }
      }
    } catch (error) {
      // Workspaces directory doesn't exist yet
      safeLog("Workspaces directory not found");
    }
    
    return workspaces;
  }

  // Method to clean up a query when a workspace is removed
  async removeWorkspace(workspaceId: string): Promise<void> {
    const activeQuery = this.queries.get(workspaceId);
    if (activeQuery) {
      activeQuery.messageQueue.close();
      this.queries.delete(workspaceId);
      safeLog(`[${workspaceId}] Query removed`);
    }
  }
}

// Export singleton instance
export default new ClaudeService();

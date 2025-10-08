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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpcMain = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fsPromises = __importStar(require("fs/promises"));
const git_1 = require("../git");
const aiService_1 = require("../services/aiService");
const historyService_1 = require("../services/historyService");
const partialService_1 = require("../services/partialService");
const message_1 = require("../types/message");
const log_1 = require("../services/log");
const ipc_constants_1 = require("../constants/ipc-constants");
const result_1 = require("../types/result");
const workspaceValidation_1 = require("../utils/validation/workspaceValidation");
const bash_1 = require("../services/tools/bash");
const toolLimits_1 = require("../constants/toolLimits");
const createUnknownSendMessageError = (raw) => ({
    type: "unknown",
    raw,
});
/**
 * IpcMain - Manages all IPC handlers and service coordination
 *
 * This class encapsulates:
 * - All ipcMain handler registration
 * - Service lifecycle management (AIService, HistoryService, PartialService)
 * - Event forwarding from services to renderer
 *
 * Design:
 * - Constructor accepts only Config for dependency injection
 * - Services are created internally from Config
 * - register() accepts ipcMain and BrowserWindow for handler setup
 */
class IpcMain {
    config;
    historyService;
    partialService;
    aiService;
    mainWindow = null;
    constructor(config) {
        this.config = config;
        this.historyService = new historyService_1.HistoryService(config);
        this.partialService = new partialService_1.PartialService(config, this.historyService);
        this.aiService = new aiService_1.AIService(config, this.historyService, this.partialService);
    }
    /**
     * Register all IPC handlers and setup event forwarding
     * @param ipcMain - Electron's ipcMain module
     * @param mainWindow - The main BrowserWindow for sending events
     */
    register(ipcMain, mainWindow) {
        this.mainWindow = mainWindow;
        this.registerConfigHandlers(ipcMain);
        this.registerDialogHandlers(ipcMain);
        this.registerWorkspaceHandlers(ipcMain);
        this.registerProviderHandlers(ipcMain);
        this.registerSubscriptionHandlers(ipcMain);
        this.setupEventForwarding();
    }
    registerConfigHandlers(ipcMain) {
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.CONFIG_LOAD, () => {
            const projectsConfig = this.config.loadConfigOrDefault();
            return {
                projects: Array.from(projectsConfig.projects.entries()),
            };
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.CONFIG_SAVE, (_event, configData) => {
            const projectsConfig = {
                projects: new Map(configData.projects),
            };
            this.config.saveConfig(projectsConfig);
            return true;
        });
    }
    registerDialogHandlers(ipcMain) {
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.DIALOG_SELECT_DIR, async () => {
            if (!this.mainWindow)
                return null;
            // Dynamic import to avoid issues with electron mocks in tests
            // eslint-disable-next-line no-restricted-syntax
            const { dialog } = await import("electron");
            const result = await dialog.showOpenDialog(this.mainWindow, {
                properties: ["openDirectory"],
            });
            if (result.canceled) {
                return null;
            }
            return result.filePaths[0];
        });
    }
    registerWorkspaceHandlers(ipcMain) {
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.WORKSPACE_CREATE, async (_event, projectPath, branchName) => {
            // Validate workspace name
            const validation = (0, workspaceValidation_1.validateWorkspaceName)(branchName);
            if (!validation.valid) {
                return { success: false, error: validation.error };
            }
            // First create the git worktree
            const result = await (0, git_1.createWorktree)(this.config, projectPath, branchName);
            if (result.success && result.path) {
                const projectName = projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "unknown";
                // Generate workspace ID using central method
                const workspaceId = this.config.generateWorkspaceId(projectPath, result.path);
                // Initialize workspace metadata
                const metadata = {
                    id: workspaceId,
                    projectName,
                    workspacePath: result.path,
                };
                await this.aiService.saveWorkspaceMetadata(workspaceId, metadata);
                // Emit metadata event for new workspace
                this.mainWindow?.webContents.send(ipc_constants_1.IPC_CHANNELS.WORKSPACE_METADATA, {
                    workspaceId,
                    metadata,
                });
                return {
                    success: true,
                    metadata,
                };
            }
            return { success: false, error: result.error ?? "Failed to create workspace" };
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.WORKSPACE_REMOVE, async (_event, workspaceId) => {
            try {
                // Load current config
                const projectsConfig = this.config.loadConfigOrDefault();
                // Find workspace path from config by generating IDs
                let workspacePath = null;
                let foundProjectPath = null;
                for (const [projectPath, projectConfig] of projectsConfig.projects.entries()) {
                    for (const workspace of projectConfig.workspaces) {
                        const generatedId = this.config.generateWorkspaceId(projectPath, workspace.path);
                        if (generatedId === workspaceId) {
                            workspacePath = workspace.path;
                            foundProjectPath = projectPath;
                            break;
                        }
                    }
                    if (workspacePath)
                        break;
                }
                // Remove git worktree if we found the path
                if (workspacePath) {
                    const worktreeExists = await fsPromises
                        .access(workspacePath)
                        .then(() => true)
                        .catch(() => false);
                    if (worktreeExists) {
                        const gitResult = await (0, git_1.removeWorktree)(workspacePath, { force: false });
                        if (!gitResult.success) {
                            const errorMessage = gitResult.error ?? "Unknown error";
                            const normalizedError = errorMessage.toLowerCase();
                            const looksLikeMissingWorktree = normalizedError.includes("not a working tree") ||
                                normalizedError.includes("does not exist") ||
                                normalizedError.includes("no such file");
                            if (looksLikeMissingWorktree) {
                                if (foundProjectPath) {
                                    const pruneResult = await (0, git_1.pruneWorktrees)(foundProjectPath);
                                    if (!pruneResult.success) {
                                        log_1.log.info(`Failed to prune stale worktrees for ${foundProjectPath} after removeWorktree error: ${pruneResult.error ?? "unknown error"}`);
                                    }
                                }
                            }
                            else {
                                return gitResult;
                            }
                        }
                    }
                    else if (foundProjectPath) {
                        const pruneResult = await (0, git_1.pruneWorktrees)(foundProjectPath);
                        if (!pruneResult.success) {
                            log_1.log.info(`Failed to prune stale worktrees for ${foundProjectPath} after detecting missing workspace at ${workspacePath}: ${pruneResult.error ?? "unknown error"}`);
                        }
                    }
                }
                // Remove the workspace from AI service
                const aiResult = await this.aiService.deleteWorkspace(workspaceId);
                if (!aiResult.success) {
                    return { success: false, error: aiResult.error };
                }
                // Update config to remove the workspace
                if (foundProjectPath && workspacePath) {
                    const projectConfig = projectsConfig.projects.get(foundProjectPath);
                    if (projectConfig) {
                        projectConfig.workspaces = projectConfig.workspaces.filter((w) => w.path !== workspacePath);
                        this.config.saveConfig(projectsConfig);
                    }
                }
                // Emit metadata event for workspace removal (with null metadata to indicate deletion)
                this.mainWindow?.webContents.send(ipc_constants_1.IPC_CHANNELS.WORKSPACE_METADATA, {
                    workspaceId,
                    metadata: null, // null indicates workspace was deleted
                });
                return { success: true };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return { success: false, error: `Failed to remove workspace: ${message}` };
            }
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.WORKSPACE_RENAME, async (_event, workspaceId, newName) => {
            try {
                // Validate workspace name
                const validation = (0, workspaceValidation_1.validateWorkspaceName)(newName);
                if (!validation.valid) {
                    return (0, result_1.Err)(validation.error ?? "Invalid workspace name");
                }
                // Block rename if there's an active stream
                if (this.aiService.isStreaming(workspaceId)) {
                    return (0, result_1.Err)("Cannot rename workspace while stream is active. Press Esc to stop the stream first.");
                }
                // Get current metadata
                const metadataResult = await this.aiService.getWorkspaceMetadata(workspaceId);
                if (!metadataResult.success) {
                    return (0, result_1.Err)(`Failed to get workspace metadata: ${metadataResult.error}`);
                }
                const oldMetadata = metadataResult.data;
                // Calculate new workspace ID
                const newWorkspaceId = `${oldMetadata.projectName}-${newName}`;
                // If renaming to itself, just return success (no-op)
                if (newWorkspaceId === workspaceId) {
                    return (0, result_1.Ok)({ newWorkspaceId });
                }
                // Check if new workspace ID already exists
                const existingMetadata = await this.aiService.getWorkspaceMetadata(newWorkspaceId);
                if (existingMetadata.success) {
                    return (0, result_1.Err)(`Workspace with name "${newName}" already exists`);
                }
                // Get old and new session directory paths
                const oldSessionDir = this.config.getSessionDir(workspaceId);
                const newSessionDir = this.config.getSessionDir(newWorkspaceId);
                // Find project path from config (needed for git operations)
                const projectsConfig = this.config.loadConfigOrDefault();
                let foundProjectPath = null;
                let workspaceIndex = -1;
                for (const [projectPath, projectConfig] of projectsConfig.projects.entries()) {
                    const idx = projectConfig.workspaces.findIndex((w) => {
                        const generatedId = this.config.generateWorkspaceId(projectPath, w.path);
                        return generatedId === workspaceId;
                    });
                    if (idx !== -1) {
                        foundProjectPath = projectPath;
                        workspaceIndex = idx;
                        break;
                    }
                }
                if (!foundProjectPath) {
                    return (0, result_1.Err)("Failed to find project path for workspace");
                }
                // Rename session directory
                await fsPromises.rename(oldSessionDir, newSessionDir);
                // Migrate workspace IDs in history messages
                const migrateResult = await this.historyService.migrateWorkspaceId(workspaceId, newWorkspaceId);
                if (!migrateResult.success) {
                    // Rollback session directory rename
                    await fsPromises.rename(newSessionDir, oldSessionDir);
                    return (0, result_1.Err)(`Failed to migrate message workspace IDs: ${migrateResult.error}`);
                }
                // Calculate new worktree path
                const oldWorktreePath = oldMetadata.workspacePath;
                const newWorktreePath = path.join(path.dirname(oldWorktreePath), newName // Use newName as the directory name
                );
                // Move worktree directory
                const moveResult = await (0, git_1.moveWorktree)(foundProjectPath, oldWorktreePath, newWorktreePath);
                if (!moveResult.success) {
                    // Rollback session directory rename
                    await fsPromises.rename(newSessionDir, oldSessionDir);
                    return (0, result_1.Err)(`Failed to move worktree: ${moveResult.error}`);
                }
                // Update metadata with new ID and path
                const newMetadata = {
                    id: newWorkspaceId,
                    projectName: oldMetadata.projectName,
                    workspacePath: newWorktreePath,
                };
                const saveResult = await this.aiService.saveWorkspaceMetadata(newWorkspaceId, newMetadata);
                if (!saveResult.success) {
                    // Rollback worktree and session directory
                    await (0, git_1.moveWorktree)(foundProjectPath, newWorktreePath, oldWorktreePath);
                    await fsPromises.rename(newSessionDir, oldSessionDir);
                    return (0, result_1.Err)(`Failed to save new metadata: ${saveResult.error}`);
                }
                // Update config with new workspace info using atomic edit
                this.config.editConfig((config) => {
                    const projectConfig = config.projects.get(foundProjectPath);
                    if (projectConfig && workspaceIndex !== -1) {
                        projectConfig.workspaces[workspaceIndex] = {
                            path: newWorktreePath,
                        };
                    }
                    return config;
                });
                // Emit metadata event for old workspace deletion
                this.mainWindow?.webContents.send(ipc_constants_1.IPC_CHANNELS.WORKSPACE_METADATA, {
                    workspaceId,
                    metadata: null,
                });
                // Emit metadata event for new workspace
                this.mainWindow?.webContents.send(ipc_constants_1.IPC_CHANNELS.WORKSPACE_METADATA, {
                    workspaceId: newWorkspaceId,
                    metadata: newMetadata,
                });
                return (0, result_1.Ok)({ newWorkspaceId });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return (0, result_1.Err)(`Failed to rename workspace: ${message}`);
            }
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.WORKSPACE_LIST, () => {
            try {
                return this.config.getAllWorkspaceMetadata();
            }
            catch (error) {
                console.error("Failed to list workspaces:", error);
                return [];
            }
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.WORKSPACE_GET_INFO, async (_event, workspaceId) => {
            const result = await this.aiService.getWorkspaceMetadata(workspaceId);
            return result.success ? result.data : null;
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.WORKSPACE_SEND_MESSAGE, async (_event, workspaceId, message, options) => {
            const { editMessageId, thinkingLevel, model, toolPolicy, additionalSystemInstructions, maxOutputTokens, } = options ?? {};
            log_1.log.debug("sendMessage handler: Received", {
                workspaceId,
                messagePreview: message.substring(0, 50),
                editMessageId,
                thinkingLevel,
                model,
                toolPolicy,
                additionalSystemInstructions,
                maxOutputTokens,
            });
            try {
                // Early exit: empty message = either interrupt (if streaming) or invalid input
                // This prevents race conditions where empty messages arrive after streaming stops
                if (!message.trim()) {
                    // If streaming, this is an interrupt request (from Esc key)
                    if (this.aiService.isStreaming(workspaceId)) {
                        log_1.log.debug("sendMessage handler: Empty message during streaming, interrupting");
                        const stopResult = await this.aiService.stopStream(workspaceId);
                        if (!stopResult.success) {
                            log_1.log.error("Failed to stop stream:", stopResult.error);
                            return {
                                success: false,
                                error: createUnknownSendMessageError(stopResult.error),
                            };
                        }
                        return { success: true };
                    }
                    // If not streaming, reject empty message to prevent creating empty user messages
                    log_1.log.debug("sendMessage handler: Rejected empty message (not streaming)");
                    return { success: true }; // Return success to avoid error notification in UI
                }
                // If editing, truncate history after the message being edited
                if (editMessageId) {
                    const truncateResult = await this.historyService.truncateAfterMessage(workspaceId, editMessageId);
                    if (!truncateResult.success) {
                        log_1.log.error("Failed to truncate history for edit:", truncateResult.error);
                        return {
                            success: false,
                            error: createUnknownSendMessageError(truncateResult.error),
                        };
                    }
                    // Note: We don't send a clear event here. The aggregator will handle
                    // replacement automatically when the new message arrives with the same historySequence
                }
                // Create user message
                const messageId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
                const userMessage = (0, message_1.createCmuxMessage)(messageId, "user", message, {
                    // historySequence will be assigned by historyService.appendToHistory()
                    timestamp: Date.now(),
                    toolPolicy, // Store for historical record and compaction detection
                });
                // Append user message to history
                const appendResult = await this.historyService.appendToHistory(workspaceId, userMessage);
                if (!appendResult.success) {
                    log_1.log.error("Failed to append message to history:", appendResult.error);
                    return {
                        success: false,
                        error: createUnknownSendMessageError(appendResult.error),
                    };
                }
                // Broadcast the user message immediately to the frontend
                if (this.mainWindow) {
                    this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(workspaceId), userMessage);
                }
                // Commit any existing partial to history BEFORE loading
                // This ensures interrupted messages are included in the AI's context
                await this.partialService.commitToHistory(workspaceId);
                // Get full conversation history
                const historyResult = await this.historyService.getHistory(workspaceId);
                if (!historyResult.success) {
                    log_1.log.error("Failed to get conversation history:", historyResult.error);
                    return {
                        success: false,
                        error: createUnknownSendMessageError(historyResult.error),
                    };
                }
                // Stream the AI response
                if (!model) {
                    log_1.log.error("No model provided by frontend");
                    return {
                        success: false,
                        error: createUnknownSendMessageError("No model specified. Please select a model using /model command."),
                    };
                }
                log_1.log.debug("sendMessage handler: Calling aiService.streamMessage with thinkingLevel", {
                    thinkingLevel,
                    model,
                    toolPolicy,
                    additionalSystemInstructions,
                    maxOutputTokens,
                });
                const streamResult = await this.aiService.streamMessage(historyResult.data, workspaceId, model, thinkingLevel, toolPolicy, undefined, additionalSystemInstructions, maxOutputTokens);
                log_1.log.debug("sendMessage handler: Stream completed");
                return streamResult;
            }
            catch (error) {
                // Convert to SendMessageError for typed error handling
                const errorMessage = error instanceof Error ? error.message : String(error);
                log_1.log.error("Unexpected error in sendMessage handler:", error);
                const sendError = {
                    type: "unknown",
                    raw: `Failed to send message: ${errorMessage}`,
                };
                return { success: false, error: sendError };
            }
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY, async (_event, workspaceId, percentage) => {
            // Block truncate if there's an active stream
            // User must press Esc first to stop stream and commit partial to history
            if (this.aiService.isStreaming(workspaceId)) {
                return {
                    success: false,
                    error: "Cannot truncate history while stream is active. Press Esc to stop the stream first.",
                };
            }
            // Truncate chat.jsonl (only operates on committed history)
            // Note: partial.json is NOT touched here - it has its own lifecycle
            // Interrupted messages are committed to history by stream-abort handler
            const truncateResult = await this.historyService.truncateHistory(workspaceId, percentage ?? 1.0);
            if (!truncateResult.success) {
                return { success: false, error: truncateResult.error };
            }
            // Send DeleteMessage event to frontend with deleted historySequence numbers
            const deletedSequences = truncateResult.data;
            if (deletedSequences.length > 0 && this.mainWindow) {
                const deleteMessage = {
                    type: "delete",
                    historySequences: deletedSequences,
                };
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(workspaceId), deleteMessage);
            }
            return { success: true, data: undefined };
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.WORKSPACE_REPLACE_HISTORY, async (_event, workspaceId, summaryMessage) => {
            // Block replace if there's an active stream, UNLESS this is a compacted message
            // (which is called from stream-end handler before stream cleanup completes)
            const isCompaction = summaryMessage.metadata?.compacted === true;
            if (!isCompaction && this.aiService.isStreaming(workspaceId)) {
                return (0, result_1.Err)("Cannot replace history while stream is active. Press Esc to stop the stream first.");
            }
            try {
                // Get all existing messages to collect their historySequence numbers
                const historyResult = await this.historyService.getHistory(workspaceId);
                const deletedSequences = historyResult.success
                    ? historyResult.data
                        .map((msg) => msg.metadata?.historySequence ?? -1)
                        .filter((s) => s >= 0)
                    : [];
                // Clear entire history
                const clearResult = await this.historyService.clearHistory(workspaceId);
                if (!clearResult.success) {
                    return (0, result_1.Err)(`Failed to clear history: ${clearResult.error}`);
                }
                // Append the summary message to history (gets historySequence assigned by backend)
                // Frontend provides the message with all metadata (compacted, timestamp, etc.)
                const appendResult = await this.historyService.appendToHistory(workspaceId, summaryMessage);
                if (!appendResult.success) {
                    return (0, result_1.Err)(`Failed to append summary: ${appendResult.error}`);
                }
                // Send delete event to frontend for all old messages
                if (deletedSequences.length > 0 && this.mainWindow) {
                    const deleteMessage = {
                        type: "delete",
                        historySequences: deletedSequences,
                    };
                    this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(workspaceId), deleteMessage);
                }
                // Send the new summary message to frontend
                if (this.mainWindow) {
                    this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(workspaceId), summaryMessage);
                }
                return (0, result_1.Ok)(undefined);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return (0, result_1.Err)(`Failed to replace history: ${message}`);
            }
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.WORKSPACE_EXECUTE_BASH, async (_event, workspaceId, script, options) => {
            try {
                // Get workspace metadata to find workspacePath
                const metadataResult = await this.aiService.getWorkspaceMetadata(workspaceId);
                if (!metadataResult.success) {
                    return (0, result_1.Err)(`Failed to get workspace metadata: ${metadataResult.error}`);
                }
                const workspacePath = metadataResult.data.workspacePath;
                // Create bash tool with workspace's cwd
                const bashTool = (0, bash_1.createBashTool)({ cwd: workspacePath });
                // Execute the script with provided options
                const requestedMaxLines = options?.max_lines ?? toolLimits_1.BASH_DEFAULT_MAX_LINES;
                const normalizedMaxLines = Math.max(1, Math.floor(requestedMaxLines));
                const clampedMaxLines = Math.min(normalizedMaxLines, toolLimits_1.BASH_HARD_MAX_LINES);
                const result = (await bashTool.execute({
                    script,
                    timeout_secs: options?.timeout_secs ?? 120,
                    max_lines: clampedMaxLines,
                    stdin: options?.stdin,
                }, {
                    toolCallId: `bash-${Date.now()}`,
                    messages: [],
                }));
                return (0, result_1.Ok)(result);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return (0, result_1.Err)(`Failed to execute bash command: ${message}`);
            }
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.WORKSPACE_OPEN_TERMINAL, (_event, workspacePath) => {
            try {
                if (process.platform === "darwin") {
                    // macOS - try Ghostty first, fallback to Terminal.app
                    try {
                        (0, child_process_1.spawn)("open", ["-a", "Ghostty", workspacePath], { detached: true });
                    }
                    catch {
                        (0, child_process_1.spawn)("open", ["-a", "Terminal", workspacePath], { detached: true });
                    }
                }
                else if (process.platform === "win32") {
                    // Windows
                    (0, child_process_1.spawn)("cmd", ["/c", "start", "cmd", "/K", "cd", "/D", workspacePath], {
                        detached: true,
                        shell: true,
                    });
                }
                else {
                    // Linux - try x-terminal-emulator, fallback to xterm
                    try {
                        (0, child_process_1.spawn)("x-terminal-emulator", [], {
                            cwd: workspacePath,
                            detached: true,
                        });
                    }
                    catch {
                        (0, child_process_1.spawn)("xterm", [], { cwd: workspacePath, detached: true });
                    }
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log_1.log.error(`Failed to open terminal: ${message}`);
            }
        });
    }
    registerProviderHandlers(ipcMain) {
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.PROVIDERS_SET_CONFIG, (_event, provider, keyPath, value) => {
            try {
                // Load current providers config or create empty
                const providersConfig = this.config.loadProvidersConfig() ?? {};
                // Ensure provider exists
                if (!providersConfig[provider]) {
                    providersConfig[provider] = {};
                }
                // Set nested property value
                let current = providersConfig[provider];
                for (let i = 0; i < keyPath.length - 1; i++) {
                    const key = keyPath[i];
                    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
                        current[key] = {};
                    }
                    current = current[key];
                }
                if (keyPath.length > 0) {
                    current[keyPath[keyPath.length - 1]] = value;
                }
                // Save updated config
                this.config.saveProvidersConfig(providersConfig);
                return { success: true, data: undefined };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return { success: false, error: `Failed to set provider config: ${message}` };
            }
        });
        ipcMain.handle(ipc_constants_1.IPC_CHANNELS.PROVIDERS_LIST, () => {
            try {
                // Return all supported providers, not just configured ones
                // This matches the providers defined in the registry
                return ["anthropic", "openai", "google"];
            }
            catch (error) {
                log_1.log.error("Failed to list providers:", error);
                return [];
            }
        });
    }
    registerSubscriptionHandlers(ipcMain) {
        // Handle subscription events for chat history
        ipcMain.on(`workspace:chat:subscribe`, (_event, workspaceId) => {
            void (async () => {
                const chatChannel = (0, ipc_constants_1.getChatChannel)(workspaceId);
                const history = await this.historyService.getHistory(workspaceId);
                if (history.success) {
                    for (const msg of history.data) {
                        this.mainWindow?.webContents.send(chatChannel, msg);
                    }
                    // Check if there's an active stream or a partial message
                    const streamInfo = this.aiService.getStreamInfo(workspaceId);
                    const partial = await this.partialService.readPartial(workspaceId);
                    if (streamInfo) {
                        // Stream is actively running - replay events to re-establish streaming context
                        // Events flow: StreamManager → AIService → IpcMain → renderer
                        // This ensures frontend receives stream-start and creates activeStream entry
                        // so that stream-end can properly clean up the streaming indicator
                        this.aiService.replayStream(workspaceId);
                    }
                    else if (partial) {
                        // No active stream but there's a partial - send as regular message (shows INTERRUPTED)
                        this.mainWindow?.webContents.send(chatChannel, partial);
                    }
                }
                this.mainWindow?.webContents.send(chatChannel, { type: "caught-up" });
            })();
        });
        // Handle subscription events for metadata
        ipcMain.on(ipc_constants_1.IPC_CHANNELS.WORKSPACE_METADATA_SUBSCRIBE, () => {
            try {
                const workspaceMetadata = this.config.getAllWorkspaceMetadata();
                // Emit current metadata for each workspace
                for (const metadata of workspaceMetadata) {
                    this.mainWindow?.webContents.send(ipc_constants_1.IPC_CHANNELS.WORKSPACE_METADATA, {
                        workspaceId: metadata.id,
                        metadata,
                    });
                }
            }
            catch (error) {
                console.error("Failed to emit current metadata:", error);
            }
        });
    }
    setupEventForwarding() {
        // Set up event listeners for AI service
        this.aiService.on("stream-start", (data) => {
            if (this.mainWindow) {
                // Send the actual stream-start event
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(data.workspaceId), data);
            }
        });
        this.aiService.on("stream-delta", (data) => {
            if (this.mainWindow) {
                // Send ONLY the delta event - efficient IPC usage
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(data.workspaceId), data);
            }
        });
        this.aiService.on("stream-end", (data) => {
            if (this.mainWindow) {
                // Send the stream-end event with final content and metadata
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(data.workspaceId), data);
            }
        });
        // Forward tool events to renderer
        this.aiService.on("tool-call-start", (data) => {
            if (this.mainWindow) {
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(data.workspaceId), data);
            }
        });
        this.aiService.on("tool-call-delta", (data) => {
            if (this.mainWindow) {
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(data.workspaceId), data);
            }
        });
        this.aiService.on("tool-call-end", (data) => {
            if (this.mainWindow) {
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(data.workspaceId), data);
            }
        });
        // Forward reasoning events to renderer
        this.aiService.on("reasoning-delta", (data) => {
            if (this.mainWindow) {
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(data.workspaceId), data);
            }
        });
        this.aiService.on("reasoning-end", (data) => {
            if (this.mainWindow) {
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(data.workspaceId), data);
            }
        });
        this.aiService.on("error", (data) => {
            if (this.mainWindow) {
                // Send properly typed StreamErrorMessage
                const errorMessage = {
                    type: "stream-error",
                    messageId: data.messageId,
                    error: data.error,
                    errorType: data.errorType ?? "unknown",
                };
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(data.workspaceId), errorMessage);
            }
        });
        // Handle stream abort events
        this.aiService.on("stream-abort", (data) => {
            if (this.mainWindow) {
                // Send the stream-abort event to frontend
                this.mainWindow.webContents.send((0, ipc_constants_1.getChatChannel)(data.workspaceId), {
                    type: "stream-abort",
                    workspaceId: data.workspaceId,
                    messageId: data.messageId,
                });
            }
        });
    }
}
exports.IpcMain = IpcMain;
//# sourceMappingURL=ipcMain.js.map
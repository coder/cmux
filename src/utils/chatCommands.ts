/**
 * Chat command execution utilities
 * Handles executing workspace operations from slash commands
 *
 * These utilities are shared between ChatInput command handlers and UI components
 * to ensure consistent behavior and avoid duplication.
 */

import type { SendMessageOptions } from "@/types/ipc";
import type { CmuxFrontendMetadata, CompactionRequestData } from "@/types/message";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import { CUSTOM_EVENTS } from "@/constants/events";
import type { Toast } from "@/components/ChatInputToast";
import type { ParsedCommand } from "@/utils/slashCommands/types";
import { applyCompactionOverrides } from "@/utils/messages/compactionOptions";
import { resolveCompactionModel } from "@/utils/messages/compactionModelPreference";

// ============================================================================
// Workspace Creation
// ============================================================================

export interface CreateWorkspaceOptions {
  projectPath: string;
  workspaceName: string;
  trunkBranch?: string;
  startMessage?: string;
  sendMessageOptions?: SendMessageOptions;
}

export interface CreateWorkspaceResult {
  success: boolean;
  workspaceInfo?: FrontendWorkspaceMetadata;
  error?: string;
}

/**
 * Create a new workspace and switch to it
 * Handles backend creation, dispatching switch event, and optionally sending start message
 *
 * Shared between /new command and NewWorkspaceModal
 */
export async function createNewWorkspace(
  options: CreateWorkspaceOptions
): Promise<CreateWorkspaceResult> {
  // Get recommended trunk if not provided
  let effectiveTrunk = options.trunkBranch;
  if (!effectiveTrunk) {
    const { recommendedTrunk } = await window.api.projects.listBranches(options.projectPath);
    effectiveTrunk = recommendedTrunk ?? "main";
  }

  const result = await window.api.workspace.create(
    options.projectPath,
    options.workspaceName,
    effectiveTrunk
  );

  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to create workspace" };
  }

  // Get workspace info for switching
  const workspaceInfo = await window.api.workspace.getInfo(result.metadata.id);
  if (!workspaceInfo) {
    return { success: false, error: "Failed to get workspace info after creation" };
  }

  // Dispatch event to switch workspace
  dispatchWorkspaceSwitch(workspaceInfo);

  // If there's a start message, defer until React finishes rendering and WorkspaceStore subscribes
  if (options.startMessage && options.sendMessageOptions) {
    requestAnimationFrame(() => {
      void window.api.workspace.sendMessage(
        result.metadata.id,
        options.startMessage!,
        options.sendMessageOptions
      );
    });
  }

  return { success: true, workspaceInfo };
}

/**
 * Format /new command string for display
 */
export function formatNewCommand(
  workspaceName: string,
  trunkBranch?: string,
  startMessage?: string
): string {
  let cmd = `/new ${workspaceName}`;
  if (trunkBranch) {
    cmd += ` -t ${trunkBranch}`;
  }
  if (startMessage) {
    cmd += `\n${startMessage}`;
  }
  return cmd;
}

// ============================================================================
// Workspace Forking
// ============================================================================

export { forkWorkspace, type ForkResult } from "./workspaceFork";
// Re-export internal type with different name to avoid confusion
export type { ForkOptions as ForkExecutionOptions } from "./workspaceFork";

/**
 * User-facing fork options (modal/command inputs)
 */
export interface ForkOptions {
  newName: string;
  startMessage?: string;
}

/**
 * Format /fork command string for display
 */
export function formatForkCommand(options: ForkOptions): string {
  let cmd = `/fork ${options.newName}`;
  if (options.startMessage) {
    cmd += `\n${options.startMessage}`;
  }
  return cmd;
}

// ============================================================================
// Compaction
// ============================================================================

/**
 * User-facing compaction options (modal/command inputs)
 */
export interface CompactOptions {
  maxOutputTokens?: number;
  model?: string;
  continueMessage?: string;
}

/**
 * Internal execution options (includes workspace context)
 */
export interface CompactExecutionOptions {
  workspaceId: string;
  maxOutputTokens?: number;
  continueMessage?: string;
  model?: string;
  sendMessageOptions: SendMessageOptions;
  editMessageId?: string;
}

export interface CompactionResult {
  success: boolean;
  error?: string;
}

/**
 * Prepare compaction message from options
 * Returns the actual message text (summarization request), metadata, and options
 */
export function prepareCompactionMessage(options: CompactExecutionOptions): {
  messageText: string;
  metadata: CmuxFrontendMetadata;
  sendOptions: SendMessageOptions;
} {
  const targetWords = options.maxOutputTokens ? Math.round(options.maxOutputTokens / 1.3) : 2000;

  // Build compaction message with optional continue context
  let messageText = `Summarize this conversation into a compact form for a new Assistant to continue helping the user. Use approximately ${targetWords} words.`;

  if (options.continueMessage) {
    messageText += `\n\nThe user wants to continue with: ${options.continueMessage}`;
  }

  // Handle model preference (sticky globally)
  const effectiveModel = resolveCompactionModel(options.model);

  // Create compaction metadata (will be stored in user message)
  const compactData: CompactionRequestData = {
    model: effectiveModel,
    maxOutputTokens: options.maxOutputTokens,
    continueMessage: options.continueMessage,
  };

  const metadata: CmuxFrontendMetadata = {
    type: "compaction-request",
    rawCommand: formatCompactCommand({
      maxOutputTokens: options.maxOutputTokens,
      model: options.model,
      continueMessage: options.continueMessage,
    }),
    parsed: compactData,
  };

  // Apply compaction overrides
  const sendOptions = applyCompactionOverrides(options.sendMessageOptions, compactData);

  return { messageText, metadata, sendOptions };
}

/**
 * Execute a compaction command
 */
export async function executeCompaction(
  options: CompactExecutionOptions
): Promise<CompactionResult> {
  const { messageText, metadata, sendOptions } = prepareCompactionMessage(options);

  const result = await window.api.workspace.sendMessage(options.workspaceId, messageText, {
    ...sendOptions,
    cmuxMetadata: metadata,
    editMessageId: options.editMessageId,
  });

  if (!result.success) {
    // Convert SendMessageError to string for error display
    const errorString = result.error
      ? typeof result.error === "string"
        ? result.error
        : "type" in result.error
          ? result.error.type
          : "Failed to compact"
      : undefined;
    return { success: false, error: errorString };
  }

  return { success: true };
}

/**
 * Format compaction command string for display
 */
export function formatCompactCommand(options: CompactOptions): string {
  let cmd = "/compact";
  if (options.maxOutputTokens) {
    cmd += ` -t ${options.maxOutputTokens}`;
  }
  if (options.model) {
    cmd += ` -m ${options.model}`;
  }
  if (options.continueMessage) {
    cmd += `\n${options.continueMessage}`;
  }
  return cmd;
}



// ============================================================================
// Command Handler Types
// ============================================================================

export interface CommandHandlerContext {
  workspaceId: string;
  sendMessageOptions: SendMessageOptions;
  editMessageId?: string;
  setInput: (value: string) => void;
  setIsSending: (value: boolean) => void;
  setToast: (toast: Toast) => void;
  onCancelEdit?: () => void;
}

export interface CommandHandlerResult {
  /** Whether the input should be cleared */
  clearInput: boolean;
  /** Whether to show a toast (already set via context.setToast) */
  toastShown: boolean;
}

/**
 * Handle /new command execution
 */
export async function handleNewCommand(
  parsed: Extract<ParsedCommand, { type: "new" }>,
  context: CommandHandlerContext
): Promise<CommandHandlerResult> {
  const { workspaceId, sendMessageOptions, setInput, setIsSending, setToast } = context;

  // Open modal if no workspace name provided
  if (!parsed.workspaceName) {
    setInput("");
    const event = new CustomEvent(CUSTOM_EVENTS.EXECUTE_COMMAND, {
      detail: { commandId: "ws:new" },
    });
    window.dispatchEvent(event);
    return { clearInput: true, toastShown: false };
  }

  setInput("");
  setIsSending(true);

  try {
    // Get workspace info to extract projectPath
    const workspaceInfo = await window.api.workspace.getInfo(workspaceId);
    if (!workspaceInfo) {
      throw new Error("Failed to get workspace info");
    }

    const createResult = await createNewWorkspace({
      projectPath: workspaceInfo.projectPath,
      workspaceName: parsed.workspaceName,
      trunkBranch: parsed.trunkBranch,
      startMessage: parsed.startMessage,
      sendMessageOptions,
    });

    if (!createResult.success) {
      const errorMsg = createResult.error ?? "Failed to create workspace";
      console.error("Failed to create workspace:", errorMsg);
      setToast({
        id: Date.now().toString(),
        type: "error",
        title: "Create Failed",
        message: errorMsg,
      });
      return { clearInput: false, toastShown: true };
    }

    setToast({
      id: Date.now().toString(),
      type: "success",
      message: `Created workspace "${parsed.workspaceName}"`,
    });
    return { clearInput: true, toastShown: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Failed to create workspace";
    console.error("Create error:", error);
    setToast({
      id: Date.now().toString(),
      type: "error",
      title: "Create Failed",
      message: errorMsg,
    });
    return { clearInput: false, toastShown: true };
  } finally {
    setIsSending(false);
  }
}

/**
 * Handle /compact command execution
 */
export async function handleCompactCommand(
  parsed: Extract<ParsedCommand, { type: "compact" }>,
  context: CommandHandlerContext
): Promise<CommandHandlerResult> {
  const {
    workspaceId,
    sendMessageOptions,
    editMessageId,
    setInput,
    setIsSending,
    setToast,
    onCancelEdit,
  } = context;

  setInput("");
  setIsSending(true);

  try {
    const result = await executeCompaction({
      workspaceId,
      maxOutputTokens: parsed.maxOutputTokens,
      continueMessage: parsed.continueMessage,
      model: parsed.model,
      sendMessageOptions,
      editMessageId,
    });

    if (!result.success) {
      console.error("Failed to initiate compaction:", result.error);
      const errorMsg = result.error ?? "Failed to start compaction";
      setToast({
        id: Date.now().toString(),
        type: "error",
        message: errorMsg,
      });
      return { clearInput: false, toastShown: true };
    }

    setToast({
      id: Date.now().toString(),
      type: "success",
      message: parsed.continueMessage
        ? "Compaction started. Will continue automatically after completion."
        : "Compaction started. AI will summarize the conversation.",
    });

    // Clear editing state on success
    if (editMessageId && onCancelEdit) {
      onCancelEdit();
    }

    return { clearInput: true, toastShown: true };
  } catch (error) {
    console.error("Compaction error:", error);
    setToast({
      id: Date.now().toString(),
      type: "error",
      message: error instanceof Error ? error.message : "Failed to start compaction",
    });
    return { clearInput: false, toastShown: true };
  } finally {
    setIsSending(false);
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Dispatch a custom event to switch workspaces
 */
export function dispatchWorkspaceSwitch(workspaceInfo: FrontendWorkspaceMetadata): void {
  window.dispatchEvent(
    new CustomEvent(CUSTOM_EVENTS.WORKSPACE_FORK_SWITCH, {
      detail: workspaceInfo,
    })
  );
}

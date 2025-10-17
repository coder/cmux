/**
 * Workspace forking utilities
 * Handles forking workspaces and switching UI state
 */

import type { SendMessageOptions } from "@/types/ipc";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import { CUSTOM_EVENTS } from "@/constants/events";
import { copyWorkspaceStorage } from "@/constants/storage";

export interface ForkOptions {
  sourceWorkspaceId: string;
  newName: string;
  startMessage?: string;
  sendMessageOptions?: SendMessageOptions;
}

export interface ForkResult {
  success: boolean;
  workspaceInfo?: FrontendWorkspaceMetadata;
  error?: string;
}

/**
 * Fork a workspace and switch to it
 * Handles copying storage, dispatching switch event, and optionally sending start message
 *
 * Caller is responsible for error handling, logging, and showing toasts
 */
export async function forkWorkspace(options: ForkOptions): Promise<ForkResult> {
  const result = await window.api.workspace.fork(options.sourceWorkspaceId, options.newName);

  if (!result.success) {
    return { success: false, error: result.error ?? "Failed to fork workspace" };
  }

  // Copy UI state to the new workspace
  copyWorkspaceStorage(options.sourceWorkspaceId, result.metadata.id);

  // Get workspace info for switching
  const workspaceInfo = await window.api.workspace.getInfo(result.metadata.id);
  if (!workspaceInfo) {
    return { success: false, error: "Failed to get workspace info after fork" };
  }

  // Dispatch event to switch workspace
  dispatchWorkspaceSwitch(workspaceInfo);

  // If there's a start message, send it after a short delay to let the workspace switch
  if (options.startMessage && options.sendMessageOptions) {
    setTimeout(() => {
      void window.api.workspace.sendMessage(
        result.metadata.id,
        options.startMessage!,
        options.sendMessageOptions
      );
    }, 300);
  }

  return { success: true, workspaceInfo };
}

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

/**
 * Type guard for workspace fork switch events
 */
export function isWorkspaceForkSwitchEvent(
  event: Event
): event is CustomEvent<FrontendWorkspaceMetadata> {
  return event.type === CUSTOM_EVENTS.WORKSPACE_FORK_SWITCH;
}

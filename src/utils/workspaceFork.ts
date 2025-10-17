/**
 * Workspace forking utilities
 * Handles forking workspaces and switching UI state
 */

import type { SendMessageOptions } from "@/types/ipc";
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
  metadata?: { id: string; projectName: string };
  projectPath?: string;
  error?: string;
}

export type ToastSetter = (toast: {
  id: string;
  type: "success" | "error";
  message: string;
  title?: string;
}) => void;

/**
 * Fork a workspace and switch to it
 * Handles copying storage, dispatching switch event, and optionally sending start message
 */
export async function forkWorkspace(
  options: ForkOptions,
  setToast: ToastSetter
): Promise<{ success: boolean; error?: string }> {
  try {
    const result: ForkResult = await window.api.workspace.fork(
      options.sourceWorkspaceId,
      options.newName
    );

    if (!result.success) {
      const errorMsg = result.error ?? "Failed to fork workspace";
      console.error("Failed to fork workspace:", errorMsg);
      setToast({
        id: Date.now().toString(),
        type: "error",
        title: "Fork Failed",
        message: errorMsg,
      });
      return { success: false, error: errorMsg };
    }

    // Copy UI state to the new workspace
    copyWorkspaceStorage(options.sourceWorkspaceId, result.metadata!.id);

    setToast({
      id: Date.now().toString(),
      type: "success",
      message: `Forked to workspace "${options.newName}"`,
    });

    // Get workspace paths using the API
    const workspaceInfo = await window.api.workspace.getInfo(result.metadata!.id);
    if (!workspaceInfo) {
      console.error("Failed to get workspace info after fork");
      return { success: false, error: "Failed to get workspace info" };
    }

    // Dispatch event to switch workspace
    dispatchWorkspaceSwitch({
      workspaceId: result.metadata!.id,
      projectPath: result.projectPath!,
      projectName: result.metadata!.projectName,
      workspacePath: workspaceInfo.namedWorkspacePath,
      branch: options.newName,
    });

    // If there's a start message, send it after a short delay to let the workspace switch
    if (options.startMessage && options.sendMessageOptions) {
      setTimeout(() => {
        void window.api.workspace
          .sendMessage(result.metadata!.id, options.startMessage!, options.sendMessageOptions)
          .catch((error) => {
            console.error("Failed to send start message:", error);
            setToast({
              id: Date.now().toString(),
              type: "error",
              message: "Failed to send start message",
            });
          });
      }, 300);
    }

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Failed to fork workspace";
    console.error("Fork error:", error);
    setToast({
      id: Date.now().toString(),
      type: "error",
      title: "Fork Failed",
      message: errorMsg,
    });
    return { success: false, error: errorMsg };
  }
}

/**
 * Dispatch a custom event to switch workspaces
 */
export function dispatchWorkspaceSwitch(detail: {
  workspaceId: string;
  projectPath: string;
  projectName: string;
  workspacePath: string;
  branch: string;
}): void {
  window.dispatchEvent(
    new CustomEvent(CUSTOM_EVENTS.WORKSPACE_FORK_SWITCH, {
      detail,
    })
  );
}

/**
 * Type guard for workspace fork switch events
 */
export function isWorkspaceForkSwitchEvent(event: Event): event is CustomEvent<{
  workspaceId: string;
  projectPath: string;
  projectName: string;
  workspacePath: string;
  branch: string;
}> {
  return event.type === CUSTOM_EVENTS.WORKSPACE_FORK_SWITCH;
}

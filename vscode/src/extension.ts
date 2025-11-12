import * as vscode from "vscode";
import { getAllWorkspaces, WorkspaceWithContext } from "./cmuxConfig";
import { openWorkspace } from "./workspaceOpener";

/**
 * Format relative time (e.g., "2 hours ago", "yesterday")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return "just now";
  } else if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  } else if (days === 1) {
    return "yesterday";
  } else if (days < 7) {
    return `${days} days ago`;
  } else if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
  } else if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months !== 1 ? "s" : ""} ago`;
  } else {
    const years = Math.floor(days / 365);
    return `${years} year${years !== 1 ? "s" : ""} ago`;
  }
}

/**
 * Format workspace for display in QuickPick
 */
function formatWorkspaceLabel(workspace: WorkspaceWithContext): string {
  // Choose icon based on streaming status and runtime type
  const icon = workspace.extensionMetadata?.streaming
    ? "$(sync~spin)" // Spinning icon for active streaming
    : workspace.runtimeConfig?.type === "ssh"
      ? "$(remote)"
      : "$(folder)";

  const baseName = `${icon} [${workspace.projectName}] ${workspace.name}`;

  // Add SSH host info if applicable
  if (workspace.runtimeConfig?.type === "ssh") {
    return `${baseName} (ssh: ${workspace.runtimeConfig.host})`;
  }

  return baseName;
}

/**
 * Create QuickPick item for a workspace
 */
function createWorkspaceQuickPickItem(
  workspace: WorkspaceWithContext
): vscode.QuickPickItem & { workspace: WorkspaceWithContext } {
  // Prefer recency (last used) over created timestamp
  let detail: string | undefined;
  if (workspace.extensionMetadata?.recency) {
    detail = `Last used: ${formatRelativeTime(workspace.extensionMetadata.recency)}`;
  } else if (workspace.createdAt) {
    detail = `Created: ${new Date(workspace.createdAt).toLocaleDateString()}`;
  }

  return {
    label: formatWorkspaceLabel(workspace),
    description: workspace.projectPath,
    detail,
    workspace,
  };
}

/**
 * Command: Open a cmux workspace
 */
async function openWorkspaceCommand() {
  // Get all workspaces
  const workspaces = getAllWorkspaces();

  if (workspaces.length === 0) {
    const selection = await vscode.window.showInformationMessage(
      "No cmux workspaces found. Create a workspace in cmux first.",
      "Open cmux"
    );

    // User can't easily open cmux from VS Code, so just inform them
    if (selection === "Open cmux") {
      vscode.window.showInformationMessage(
        "Please open the cmux application to create workspaces."
      );
    }
    return;
  }

  // Create QuickPick items
  const items = workspaces.map(createWorkspaceQuickPickItem);

  // Show QuickPick
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a cmux workspace to open",
    matchOnDescription: true,
    matchOnDetail: false,
  });

  if (!selected) {
    return;
  }

  // Open the selected workspace
  await openWorkspace(selected.workspace);
}

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext) {
  // Register the openWorkspace command
  const disposable = vscode.commands.registerCommand(
    "cmux.openWorkspace",
    openWorkspaceCommand
  );

  context.subscriptions.push(disposable);
}

/**
 * Deactivate the extension
 */
export function deactivate() {}

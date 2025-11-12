import * as vscode from "vscode";
import { getAllWorkspaces, WorkspaceWithContext } from "./cmuxConfig";
import { openWorkspace } from "./workspaceOpener";

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
  return {
    label: formatWorkspaceLabel(workspace),
    description: workspace.projectPath,
    detail: workspace.createdAt
      ? `Created: ${new Date(workspace.createdAt).toLocaleDateString()}`
      : undefined,
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

import * as vscode from "vscode";
import {
  WorkspaceWithContext,
  getWorkspacePath,
  getRemoteWorkspacePath,
} from "./cmuxConfig";

/**
 * Check if a Remote-SSH extension is installed
 * Supports both VS Code official and Anysphere (Cursor) Remote-SSH extensions
 */
function isRemoteSshInstalled(): boolean {
  return (
    vscode.extensions.getExtension("ms-vscode-remote.remote-ssh") !== undefined ||
    vscode.extensions.getExtension("anysphere.remote-ssh") !== undefined
  );
}

/**
 * Get the ID of the installed Remote-SSH extension
 */
function getRemoteSshExtensionId(): string | undefined {
  if (vscode.extensions.getExtension("ms-vscode-remote.remote-ssh")) {
    return "ms-vscode-remote.remote-ssh";
  }
  if (vscode.extensions.getExtension("anysphere.remote-ssh")) {
    return "anysphere.remote-ssh";
  }
  return undefined;
}

/**
 * Open a local workspace in a new VS Code window
 */
async function openLocalWorkspace(workspace: WorkspaceWithContext) {
  const workspacePath = getWorkspacePath(
    workspace.projectPath,
    workspace.name
  );
  const uri = vscode.Uri.file(workspacePath);

  await vscode.commands.executeCommand("vscode.openFolder", uri, {
    forceNewWindow: true,
  });
}

/**
 * Open an SSH workspace in a new VS Code window
 */
async function openSshWorkspace(workspace: WorkspaceWithContext) {
  // Check if Remote-SSH is installed
  if (!isRemoteSshInstalled()) {
    vscode.window.showErrorMessage(
      'cmux: The "Remote - SSH" extension is required to open SSH workspaces. ' +
        "Please install it from the Extensions marketplace.",
      "Open Extensions"
    ).then((selection) => {
      if (selection === "Open Extensions") {
        // Search for the appropriate extension based on the editor
        const extensionId = vscode.env.appName.toLowerCase().includes("cursor")
          ? "anysphere.remote-ssh"
          : "ms-vscode-remote.remote-ssh";
        vscode.commands.executeCommand(
          "workbench.extensions.search",
          `@id:${extensionId}`
        );
      }
    });
    return;
  }

  if (!workspace.runtimeConfig || workspace.runtimeConfig.type !== "ssh") {
    vscode.window.showErrorMessage(
      "cmux: Workspace is not configured for SSH."
    );
    return;
  }

  const host = workspace.runtimeConfig.host;
  const remotePath = getRemoteWorkspacePath(workspace);

  // Format: vscode-remote://ssh-remote+<host><absolute-path>
  // Both ms-vscode-remote.remote-ssh and anysphere.remote-ssh use the same URI scheme
  // and vscode.openFolder command, so this works for both VS Code and Cursor
  const remoteUri = `vscode-remote://ssh-remote+${host}${remotePath}`;

  try {
    await vscode.commands.executeCommand(
      "vscode.openFolder",
      vscode.Uri.parse(remoteUri),
      { forceNewWindow: true }
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `cmux: Failed to open SSH workspace on host "${host}". ` +
        `Make sure the host is configured in your ~/.ssh/config or in the Remote-SSH extension. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      "Open SSH Config"
    ).then((selection) => {
      if (selection === "Open SSH Config") {
        vscode.commands.executeCommand(
          "remote-ssh.openConfigFile"
        );
      }
    });
  }
}

/**
 * Open a cmux workspace (local or SSH) in a new VS Code window
 */
export async function openWorkspace(
  workspace: WorkspaceWithContext
): Promise<void> {
  const isRemote =
    workspace.runtimeConfig && workspace.runtimeConfig.type === "ssh";

  if (isRemote) {
    await openSshWorkspace(workspace);
  } else {
    await openLocalWorkspace(workspace);
  }
}

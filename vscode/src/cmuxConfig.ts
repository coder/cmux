import * as path from "path";
import * as os from "os";
import { Config } from "cmux/config";
import type { WorkspaceMetadata } from "cmux/types/workspace";
import {
  type ExtensionMetadata,
  readExtensionMetadata,
} from "cmux/utils/extensionMetadata";
import { getProjectName } from "cmux/utils/runtime/helpers";

/**
 * Workspace with extension metadata for display in VS Code extension.
 * Combines workspace metadata from main app with extension-specific data.
 */
export interface WorkspaceWithContext extends WorkspaceMetadata {
  projectPath: string;
  extensionMetadata?: ExtensionMetadata;
}

/**
 * Get all workspaces from cmux config, enriched with extension metadata.
 * Uses main app's Config class to read workspace metadata, then enriches
 * with extension-specific data (recency, streaming status).
 */
export function getAllWorkspaces(): WorkspaceWithContext[] {
  const config = new Config();
  const workspaces = config.getAllWorkspaceMetadata();
  const extensionMeta = readExtensionMetadata();

  console.log(`[cmux] Read ${extensionMeta.size} entries from extension metadata`);

  // Enrich with extension metadata
  const enriched: WorkspaceWithContext[] = workspaces.map((ws) => {
    const meta = extensionMeta.get(ws.id);
    if (meta) {
      console.log(
        `[cmux]   ${ws.id}: recency=${meta.recency}, streaming=${meta.streaming}`
      );
    }
    return {
      ...ws,
      extensionMetadata: meta,
    };
  });

  // Sort by recency (extension metadata > createdAt > name)
  const recencyOf = (w: WorkspaceWithContext): number =>
    w.extensionMetadata?.recency ?? (w.createdAt ? Date.parse(w.createdAt) : 0);

  enriched.sort((a, b) => {
    const aRecency = recencyOf(a);
    const bRecency = recencyOf(b);
    if (aRecency !== bRecency) return bRecency - aRecency;
    return a.name.localeCompare(b.name);
  });

  return enriched;
}

/**
 * Get the workspace path for a local workspace
 * Uses the same logic as LocalRuntime.getWorkspacePath
 */
export function getWorkspacePath(
  projectPath: string,
  workspaceName: string
): string {
  const projectName = getProjectName(projectPath);
  const srcBaseDir = path.join(os.homedir(), ".cmux", "src");
  return path.join(srcBaseDir, projectName, workspaceName);
}

/**
 * Get the workspace path for an SSH workspace
 * Uses the same logic as SSHRuntime.getWorkspacePath
 */
export function getSSHWorkspacePath(workspace: WorkspaceWithContext): string {
  if (!workspace.runtimeConfig || workspace.runtimeConfig.type !== "ssh") {
    throw new Error("Not an SSH workspace");
  }

  const projectName = getProjectName(workspace.projectPath);
  const srcBaseDir = workspace.runtimeConfig.srcBaseDir;

  // Remote paths should be absolute (starting with / or ~)
  const basePath =
    srcBaseDir.startsWith("/") || srcBaseDir.startsWith("~")
      ? srcBaseDir
      : `/${srcBaseDir}`;

  return path.posix.join(basePath, projectName, workspace.name);
}

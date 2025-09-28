/**
 * Unified workspace metadata type used throughout the application.
 * This is the single source of truth for workspace information.
 */
export interface WorkspaceMetadata {
  /** Unique workspace identifier (e.g., "project-branch") */
  id: string;

  /** Project name extracted from project path */
  projectName: string;
}

/**
 * UI-facing workspace metadata.
 */
export type WorkspaceMetadataUI = WorkspaceMetadata;

/**
 * Event emitted when workspace metadata changes
 */
export interface WorkspaceMetadataUpdate {
  workspaceId: string;
  metadata: WorkspaceMetadata;
}

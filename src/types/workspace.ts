import { UIPermissionMode } from "./global";

/**
 * Unified workspace metadata type used throughout the application.
 * This is the single source of truth for workspace information.
 */
export interface WorkspaceMetadata {
  /** Unique workspace identifier (e.g., "project-branch") */
  id: string;

  /** Project name extracted from project path */
  projectName: string;

  /** Git branch name for this workspace */
  branch: string;

  /** Full filesystem path to the workspace */
  workspacePath: string;

  /** Current permission mode - always defined by backend */
  permissionMode: UIPermissionMode;

  /** Whether Claude is currently active for this workspace */
  isActive: boolean;

  /** Claude session ID for this workspace */
  sessionId: string;

  /** Next sequence number for messages */
  nextSequenceNumber: number;
}

/**
 * UI-facing workspace metadata without backend bookkeeping fields.
 * This type excludes fields that are only needed for backend operations
 * to prevent unnecessary re-renders in UI components.
 */
export type WorkspaceMetadataUI = Omit<WorkspaceMetadata, "nextSequenceNumber">;

/**
 * Event emitted when workspace metadata changes
 */
export interface WorkspaceMetadataUpdate {
  workspaceId: string;
  metadata: WorkspaceMetadata;
}

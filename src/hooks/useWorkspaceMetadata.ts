import { useState, useEffect } from "react";
import type { WorkspaceMetadata } from "@/types/workspace";

/**
 * Hook to subscribe to workspace metadata updates
 * Returns the current metadata for the given workspace ID
 */
export function useWorkspaceMetadata(workspaceId: string): WorkspaceMetadata | null {
  const [metadata, setMetadata] = useState<WorkspaceMetadata | null>(null);

  useEffect(() => {
    // Subscribe to metadata updates
    const unsubscribe = window.api.workspace.onMetadata(
      ({ workspaceId: id, metadata: newMetadata }) => {
        // Only update if it's for our workspace
        if (id === workspaceId) {
          setMetadata(newMetadata);
        }
      }
    );

    // Load initial metadata
    window.api.workspace.getInfo(workspaceId).then((info) => {
      if (info) {
        setMetadata(info);
      }
    });

    return unsubscribe;
  }, [workspaceId]);

  return metadata;
}

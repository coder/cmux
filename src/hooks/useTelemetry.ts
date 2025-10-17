import { useCallback } from "react";
import { trackEvent, getBaseTelemetryProperties } from "../telemetry";

/**
 * Hook for clean telemetry integration in React components
 *
 * Provides type-safe telemetry tracking with base properties automatically included.
 * Usage:
 *
 * ```tsx
 * const telemetry = useTelemetry();
 *
 * // Track workspace switch
 * telemetry.workspaceSwitched(fromId, toId);
 *
 * // Track workspace creation
 * telemetry.workspaceCreated(workspaceId);
 * ```
 */
export function useTelemetry() {
  const workspaceSwitched = useCallback((fromWorkspaceId: string, toWorkspaceId: string) => {
    trackEvent({
      event: "workspace_switched",
      properties: {
        ...getBaseTelemetryProperties(),
        fromWorkspaceId,
        toWorkspaceId,
      },
    });
  }, []);

  const workspaceCreated = useCallback((workspaceId: string) => {
    trackEvent({
      event: "workspace_created",
      properties: {
        ...getBaseTelemetryProperties(),
        workspaceId,
      },
    });
  }, []);

  return {
    workspaceSwitched,
    workspaceCreated,
  };
}

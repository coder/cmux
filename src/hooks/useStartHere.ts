import { useState } from "react";
import { startHereWithMessage } from "@/utils/startHere";

/**
 * Hook for managing Start Here button state and action.
 * Returns a button config that can be used with MessageWindow or other components.
 */
export function useStartHere(workspaceId: string | undefined, content: string) {
  const [isStartingHere, setIsStartingHere] = useState(false);

  const handleStartHere = async () => {
    if (!workspaceId || isStartingHere) return;

    setIsStartingHere(true);
    try {
      await startHereWithMessage(workspaceId, content);
    } finally {
      setIsStartingHere(false);
    }
  };

  return {
    isStartingHere,
    handleStartHere,
    buttonLabel: isStartingHere ? "Starting..." : "🎯 Start Here",
    disabled: !workspaceId || isStartingHere,
  };
}


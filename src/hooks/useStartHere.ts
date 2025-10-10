import { useState } from "react";
import { startHereWithMessage } from "@/utils/startHere";
import { COMPACTED_EMOJI } from "@/constants/ui";

/**
 * Hook for managing Start Here button state and action.
 * Returns a button config that can be used with MessageWindow or other components.
 *
 * @param workspaceId - Current workspace ID (required for operation)
 * @param content - Content to use as the new conversation starting point
 * @param isCompacted - Whether the message is already compacted (disables button if true)
 */
export function useStartHere(
  workspaceId: string | undefined,
  content: string,
  isCompacted = false
) {
  const [isStartingHere, setIsStartingHere] = useState(false);

  const handleStartHere = async () => {
    if (!workspaceId || isStartingHere || isCompacted) return;

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
    buttonLabel: isStartingHere ? "Starting..." : `${COMPACTED_EMOJI} Start Here`,
    disabled: !workspaceId || isStartingHere || isCompacted,
  };
}

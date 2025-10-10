import { useState } from "react";
import { startHereWithMessage } from "@/utils/startHere";
import { COMPACTED_EMOJI } from "@/constants/ui";

/**
 * Hook for managing Start Here button state and modal.
 * Returns a button config and modal state management.
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStartingHere, setIsStartingHere] = useState(false);

  // Opens the confirmation modal
  const openModal = () => {
    if (!workspaceId || isCompacted) return;
    setIsModalOpen(true);
  };

  // Closes the modal
  const closeModal = () => {
    setIsModalOpen(false);
  };

  // Executes the Start Here operation
  const executeStartHere = async () => {
    if (!workspaceId || isStartingHere || isCompacted) return;

    setIsStartingHere(true);
    try {
      await startHereWithMessage(workspaceId, content);
    } finally {
      setIsStartingHere(false);
    }
  };

  return {
    isModalOpen,
    openModal,
    closeModal,
    executeStartHere,
    isStartingHere,
    buttonLabel: `Start Here`,
    buttonEmoji: COMPACTED_EMOJI,
    disabled: !workspaceId || isStartingHere || isCompacted,
  };
}

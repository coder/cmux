import React, { useEffect } from "react";
import { Modal, ModalActions, PrimaryButton } from "./Modal";

interface ProjectErrorModalProps {
  error: string | null;
  onClose: () => void;
}

/**
 * Modal for displaying project-related errors (add/remove failures, validation errors, etc.).
 * Blocks the create flow until dismissed.
 */
export const ProjectErrorModal: React.FC<ProjectErrorModalProps> = ({ error, onClose }) => {
  // Auto-focus the close button for keyboard accessibility
  useEffect(() => {
    if (error) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }
  }, [error, onClose]);

  return (
    <Modal
      isOpen={!!error}
      title="Project Error"
      subtitle="Failed to add project"
      onClose={onClose}
    >
      <div className="text-foreground mb-5 text-sm">{error}</div>
      <ModalActions>
        <PrimaryButton onClick={onClose}>OK</PrimaryButton>
      </ModalActions>
    </Modal>
  );
};

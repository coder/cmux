import React, { useState } from "react";
import styled from "@emotion/styled";
import { Modal, ModalInfo, ModalActions, CancelButton, PrimaryButton } from "./Modal";

const ErrorCodeBlock = styled.pre`
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 12px;
  margin: 16px 0;
  font-size: 12px;
  font-family: var(--font-monospace);
  color: #d4d4d4;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
`;

const WarningText = styled.p`
  color: #f48771;
  font-size: 13px;
  margin: 12px 0;
  line-height: 1.5;
`;

const DangerButton = styled(PrimaryButton)`
  background: #d32f2f;
  color: white;

  &:hover:not(:disabled) {
    background: #b71c1c;
  }
`;

interface ForceDeleteModalProps {
  isOpen: boolean;
  workspaceId: string;
  error: string;
  onClose: () => void;
  onForceDelete: (workspaceId: string) => Promise<void>;
}

export const ForceDeleteModal: React.FC<ForceDeleteModalProps> = ({
  isOpen,
  workspaceId,
  error,
  onClose,
  onForceDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleForceDelete = () => {
    setIsDeleting(true);
    void (async () => {
      try {
        await onForceDelete(workspaceId);
        onClose();
      } catch (err) {
        console.error("Force delete failed:", err);
      } finally {
        setIsDeleting(false);
      }
    })();
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Force Delete Workspace?"
      onClose={onClose}
      maxWidth="600px"
      isLoading={isDeleting}
    >
      <ModalInfo>
        <p>Git worktree removal failed with the following error:</p>
      </ModalInfo>

      <ErrorCodeBlock>{error}</ErrorCodeBlock>

      <WarningText>
        ⚠️ Force deleting will remove the worktree even if it has uncommitted changes or other
        issues. This action cannot be undone.
      </WarningText>

      <ModalActions>
        <CancelButton onClick={onClose} disabled={isDeleting}>
          Cancel
        </CancelButton>
        <DangerButton onClick={handleForceDelete} disabled={isDeleting}>
          {isDeleting ? "Deleting..." : "Force Delete"}
        </DangerButton>
      </ModalActions>
    </Modal>
  );
};

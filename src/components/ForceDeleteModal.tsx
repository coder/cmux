import React, { useState } from "react";
import styled from "@emotion/styled";
import {
  Modal,
  ModalActions,
  CancelButton,
  DangerButton,
  ErrorSection,
  ErrorLabel,
  ErrorCodeBlock,
  WarningBox,
  WarningTitle,
  WarningText,
} from "./Modal";

const CenteredActions = styled(ModalActions)`
  justify-content: center;
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
      subtitle="The worktree could not be removed normally"
      onClose={onClose}
      maxWidth="600px"
      isLoading={isDeleting}
    >
      <ErrorSection>
        <ErrorLabel>Git Error</ErrorLabel>
        <ErrorCodeBlock>{error}</ErrorCodeBlock>
      </ErrorSection>

      <WarningBox>
        <WarningTitle>This action cannot be undone</WarningTitle>
        <WarningText>
          Force deleting will permanently remove the worktree and may discard uncommitted work or
          lose data.
        </WarningText>
      </WarningBox>

      <CenteredActions>
        <CancelButton onClick={onClose} disabled={isDeleting}>
          Cancel
        </CancelButton>
        <DangerButton onClick={handleForceDelete} disabled={isDeleting}>
          {isDeleting ? "Deleting..." : "Force Delete"}
        </DangerButton>
      </CenteredActions>
    </Modal>
  );
};

import React, { useState } from "react";
import styled from "@emotion/styled";
import { Modal, ModalActions, CancelButton, PrimaryButton } from "./Modal";

const ErrorSection = styled.div`
  margin: 16px 0;
`;

const ErrorLabel = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const ErrorCodeBlock = styled.pre`
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 12px;
  font-size: 12px;
  font-family: var(--font-monospace);
  color: var(--color-text);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
`;

const WarningBox = styled.div`
  background: var(--color-error-bg);
  border-left: 3px solid var(--color-error);
  border-radius: 4px;
  padding: 12px 16px;
  margin: 16px 0;
  display: flex;
  gap: 12px;
  align-items: flex-start;
`;

const WarningIcon = styled.span`
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
`;

const WarningContent = styled.div`
  flex: 1;
`;

const WarningTitle = styled.div`
  font-weight: 600;
  font-size: 13px;
  color: var(--color-error);
  margin-bottom: 4px;
`;

const WarningText = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
`;

const CenteredActions = styled(ModalActions)`
  justify-content: center;
`;

const ForceDeleteButton = styled(PrimaryButton)`
  background: var(--color-error);
  color: var(--color-background);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-error), #fff 20%);
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
      subtitle="The worktree has uncommitted changes or other conflicts"
      onClose={onClose}
      maxWidth="600px"
      isLoading={isDeleting}
    >
      <ErrorSection>
        <ErrorLabel>Git Error</ErrorLabel>
        <ErrorCodeBlock>{error}</ErrorCodeBlock>
      </ErrorSection>

      <WarningBox>
        <WarningIcon>⚠️</WarningIcon>
        <WarningContent>
          <WarningTitle>This action cannot be undone</WarningTitle>
          <WarningText>
            Force deleting will permanently remove the worktree, discarding any uncommitted work.
          </WarningText>
        </WarningContent>
      </WarningBox>

      <CenteredActions>
        <CancelButton onClick={onClose} disabled={isDeleting}>
          Cancel
        </CancelButton>
        <ForceDeleteButton onClick={handleForceDelete} disabled={isDeleting}>
          {isDeleting ? "Deleting..." : "Force Delete"}
        </ForceDeleteButton>
      </CenteredActions>
    </Modal>
  );
};

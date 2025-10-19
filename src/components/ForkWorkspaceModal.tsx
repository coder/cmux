import React, { useEffect, useId, useState } from "react";
import styled from "@emotion/styled";
import { Modal, ModalInfo, ModalActions, CancelButton, PrimaryButton } from "./Modal";
import { formatForkCommand } from "@/utils/chatCommands";

const FormGroup = styled.div`
  margin-bottom: 20px;

  label {
    display: block;
    margin-bottom: 8px;
    color: #ccc;
    font-size: 14px;
  }

  input {
    width: 100%;
    padding: 8px 12px;
    background: #2d2d2d;
    border: 1px solid #444;
    border-radius: 4px;
    color: #fff;
    font-size: 14px;

    &:focus {
      outline: none;
      border-color: #007acc;
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

const ErrorMessage = styled.div`
  color: #ff5555;
  font-size: 13px;
  margin-top: 6px;
`;

const CommandDisplay = styled.div`
  margin-top: 20px;
  padding: 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  font-family: "Menlo", "Monaco", "Courier New", monospace;
  font-size: 13px;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-all;
`;

const CommandLabel = styled.div`
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
`;

interface ForkWorkspaceModalProps {
  isOpen: boolean;
  sourceWorkspaceName: string;
  onClose: () => void;
  onFork: (newName: string) => Promise<void>;
}

const ForkWorkspaceModal: React.FC<ForkWorkspaceModalProps> = ({
  isOpen,
  sourceWorkspaceName,
  onClose,
  onFork,
}) => {
  const [newName, setNewName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const infoId = useId();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setNewName("");
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleCancel = () => {
    if (!isLoading) {
      onClose();
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError("Workspace name cannot be empty");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onFork(trimmedName);
      setNewName("");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fork workspace";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Fork Workspace"
      subtitle={`Create a fork of ${sourceWorkspaceName}`}
      onClose={handleCancel}
      isLoading={isLoading}
      describedById={infoId}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <FormGroup>
          <label htmlFor="newName">New Workspace Name:</label>
          <input
            id="newName"
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            disabled={isLoading}
            placeholder="Enter new workspace name"
            required
            aria-required="true"
            autoFocus
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </FormGroup>

        <ModalInfo id={infoId}>
          <p>
            This will create a new git branch and worktree from the current workspace state,
            preserving all uncommitted changes.
          </p>
        </ModalInfo>

        {newName.trim() && (
          <div>
            <CommandLabel>Equivalent command:</CommandLabel>
            <CommandDisplay>{formatForkCommand(newName.trim())}</CommandDisplay>
          </div>
        )}

        <ModalActions>
          <CancelButton type="button" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </CancelButton>
          <PrimaryButton type="submit" disabled={isLoading || newName.trim().length === 0}>
            {isLoading ? "Forking..." : "Fork Workspace"}
          </PrimaryButton>
        </ModalActions>
      </form>
    </Modal>
  );
};

export default ForkWorkspaceModal;

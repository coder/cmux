import React, { useEffect, useId, useState } from "react";
import {
  Modal,
  ModalInfo,
  ModalActions,
  CancelButton,
  PrimaryButton,
  FormGroup,
  ErrorMessage,
  CommandDisplay,
  CommandLabel,
} from "./Modal";
import { formatForkCommand } from "@/utils/chatCommands";

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

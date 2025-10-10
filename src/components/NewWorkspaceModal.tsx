import React, { useState, useId } from "react";
import styled from "@emotion/styled";
import { Modal, ModalInfo, ModalActions, CancelButton, PrimaryButton } from "./Modal";

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

const InfoCode = styled.code`
  display: block;
  word-break: break-all;
`;

interface NewWorkspaceModalProps {
  isOpen: boolean;
  projectPath: string;
  onClose: () => void;
  onAdd: (branchName: string) => Promise<void>;
}

const NewWorkspaceModal: React.FC<NewWorkspaceModalProps> = ({
  isOpen,
  projectPath,
  onClose,
  onAdd,
}) => {
  const [branchName, setBranchName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const infoId = useId();

  const handleCancel = () => {
    setBranchName("");
    setError(null);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedBranchName = branchName.trim();
    if (trimmedBranchName.length === 0) {
      setError("Branch name is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onAdd(trimmedBranchName);
      setBranchName("");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create workspace";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const projectName = projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "project";

  return (
    <Modal
      isOpen={isOpen}
      title="New Workspace"
      subtitle={`Create a new workspace for ${projectName}`}
      onClose={handleCancel}
      isLoading={isLoading}
      describedById={infoId}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <FormGroup>
          <label htmlFor="branchName">Branch Name:</label>
          <input
            id="branchName"
            type="text"
            value={branchName}
            onChange={(event) => {
              setBranchName(event.target.value);
              setError(null);
            }}
            placeholder="Enter branch name (e.g., feature/new-feature)"
            disabled={isLoading}
            autoFocus={isOpen}
            required
            aria-required="true"
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </FormGroup>

        <ModalInfo id={infoId}>
          <p>This will create a git worktree at:</p>
          <InfoCode>
            ~/.cmux/src/{projectName}/{branchName || "<branch-name>"}
          </InfoCode>
        </ModalInfo>

        <ModalActions>
          <CancelButton type="button" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </CancelButton>
          <PrimaryButton type="submit" disabled={isLoading || branchName.trim().length === 0}>
            {isLoading ? "Creating..." : "Create Workspace"}
          </PrimaryButton>
        </ModalActions>
      </form>
    </Modal>
  );
};

export default NewWorkspaceModal;

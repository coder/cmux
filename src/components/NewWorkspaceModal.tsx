import React, { useState, useEffect, useCallback } from "react";
import styled from "@emotion/styled";

// Styled Components
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: #1e1e1e;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  border: 1px solid #333;

  h2 {
    margin-top: 0;
    margin-bottom: 8px;
    color: #fff;
  }
`;

const ModalSubtitle = styled.p`
  color: #888;
  font-size: 14px;
  margin-bottom: 20px;
`;

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

const ModalInfo = styled.div`
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 20px;

  p {
    margin: 0 0 8px 0;
    color: #888;
    font-size: 13px;
  }

  code {
    display: block;
    color: #569cd6;
    font-family: var(--font-monospace);
    font-size: 13px;
    word-break: break-all;
  }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
`;

const Button = styled.button`
  padding: 8px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CancelBtn = styled(Button)`
  background: #444;
  color: #ccc;

  &:hover:not(:disabled) {
    background: #555;
  }
`;

const SubmitBtn = styled(Button)`
  background: #007acc;
  color: white;

  &:hover:not(:disabled) {
    background: #005a9e;
  }
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

  const handleCancel = useCallback(() => {
    setBranchName("");
    setError(null);
    onClose();
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) {
      setError("Branch name is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onAdd(branchName.trim());
      setBranchName("");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create workspace";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        handleCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, handleCancel]);

  if (!isOpen) return null;

  const projectName = projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "project";

  return (
    <ModalOverlay onClick={handleCancel}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <h2>New Workspace</h2>
        <ModalSubtitle>Create a new workspace for {projectName}</ModalSubtitle>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <FormGroup>
            <label htmlFor="branchName">Branch Name:</label>
            <input
              id="branchName"
              type="text"
              value={branchName}
              onChange={(e) => {
                setBranchName(e.target.value);
                setError(null);
              }}
              placeholder="Enter branch name (e.g., feature/new-feature)"
              disabled={isLoading}
              autoFocus
              required
            />
            {error && <ErrorMessage>{error}</ErrorMessage>}
          </FormGroup>

          <ModalInfo>
            <p>This will create a git worktree at:</p>
            <code>
              ~/.cmux/{projectName}/{branchName || "<branch-name>"}
            </code>
          </ModalInfo>

          <ModalActions>
            <CancelBtn type="button" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </CancelBtn>
            <SubmitBtn type="submit" disabled={isLoading || !branchName.trim()}>
              {isLoading ? "Creating..." : "Create Workspace"}
            </SubmitBtn>
          </ModalActions>
        </form>
      </ModalContent>
    </ModalOverlay>
  );
};

export default NewWorkspaceModal;

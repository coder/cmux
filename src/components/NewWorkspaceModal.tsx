import React, { useEffect, useId, useState } from "react";
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

  input,
  select {
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

  select {
    cursor: pointer;

    option {
      background: #2d2d2d;
      color: #fff;
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
  onAdd: (branchName: string, trunkBranch: string) => Promise<void>;
}

const NewWorkspaceModal: React.FC<NewWorkspaceModalProps> = ({
  isOpen,
  projectPath,
  onClose,
  onAdd,
}) => {
  const [branchName, setBranchName] = useState("");
  const [trunkBranch, setTrunkBranch] = useState("");
  const [defaultTrunkBranch, setDefaultTrunkBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const infoId = useId();

  const handleCancel = () => {
    setBranchName("");
    setTrunkBranch(defaultTrunkBranch);
    setError(null);
    setBranchesError(null);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedBranchName = branchName.trim();
    if (trimmedBranchName.length === 0) {
      setError("Branch name is required");
      return;
    }

    const normalizedTrunkBranch = trunkBranch.trim();
    if (normalizedTrunkBranch.length === 0) {
      setError("Trunk branch is required");
      return;
    }

    console.assert(normalizedTrunkBranch.length > 0, "Expected trunk branch name to be validated");
    console.assert(trimmedBranchName.length > 0, "Expected branch name to be validated");

    setIsLoading(true);
    setError(null);

    try {
      await onAdd(trimmedBranchName, normalizedTrunkBranch);
      setBranchName("");
      setTrunkBranch(defaultTrunkBranch);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create workspace";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Load branches when modal opens
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const loadBranches = async () => {
      setIsLoadingBranches(true);
      setBranchesError(null);
      try {
        const branchList = await window.api.projects.listBranches(projectPath);
        const rawBranches = Array.isArray(branchList?.branches) ? branchList.branches : [];
        const sanitizedBranches = rawBranches.filter(
          (branch): branch is string => typeof branch === "string"
        );

        if (!Array.isArray(branchList?.branches)) {
          console.warn("Expected listBranches to return BranchListResult", branchList);
        }

        setBranches(sanitizedBranches);

        if (sanitizedBranches.length === 0) {
          setTrunkBranch("");
          setDefaultTrunkBranch("");
          setBranchesError("No branches available in this project");
          return;
        }

        const recommended =
          typeof branchList?.recommendedTrunk === "string" &&
          sanitizedBranches.includes(branchList.recommendedTrunk)
            ? branchList.recommendedTrunk
            : sanitizedBranches[0];

        setBranchesError(null);
        setDefaultTrunkBranch(recommended);
        setTrunkBranch((current) =>
          current && sanitizedBranches.includes(current) ? current : recommended
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load branches";
        setBranches([]);
        setTrunkBranch("");
        setDefaultTrunkBranch("");
        setBranchesError(message);
      } finally {
        setIsLoadingBranches(false);
      }
    };

    void loadBranches();
  }, [isOpen, projectPath]);

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
          <label htmlFor="branchName">Workspace Branch Name:</label>
          <input
            id="branchName"
            type="text"
            value={branchName}
            onChange={(event) => {
              setBranchName(event.target.value);
              setError(null);
            }}
            placeholder="Enter branch name (e.g., feature-name)"
            disabled={isLoading}
            autoFocus={isOpen}
            required
            aria-required="true"
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </FormGroup>

        <FormGroup>
          <label htmlFor="trunkBranch">Trunk Branch:</label>
          <select
            id="trunkBranch"
            value={trunkBranch}
            onChange={(event) => setTrunkBranch(event.target.value)}
            disabled={isLoading || isLoadingBranches || branches.length === 0}
            required
            aria-required="true"
          >
            {isLoadingBranches ? (
              <option value="">Loading branches...</option>
            ) : branches.length === 0 ? (
              <option value="">No branches available</option>
            ) : (
              branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))
            )}
          </select>
          {branchesError && <ErrorMessage>{branchesError}</ErrorMessage>}
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
          <PrimaryButton
            type="submit"
            disabled={
              isLoading ||
              isLoadingBranches ||
              branchName.trim().length === 0 ||
              trunkBranch.trim().length === 0 ||
              branches.length === 0
            }
          >
            {isLoading ? "Creating..." : "Create Workspace"}
          </PrimaryButton>
        </ModalActions>
      </form>
    </Modal>
  );
};

export default NewWorkspaceModal;

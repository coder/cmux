import React, { useEffect, useId, useState } from "react";
import styled from "@emotion/styled";
import { Modal, ModalInfo, ModalActions, CancelButton, PrimaryButton } from "./Modal";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { formatNewCommand } from "@/utils/chatCommands";

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

const UnderlinedLabel = styled.span`
  text-decoration: underline dotted #666;
  text-underline-offset: 2px;
  cursor: help;
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

interface NewWorkspaceModalProps {
  isOpen: boolean;
  projectName: string;
  branches: string[];
  defaultTrunkBranch?: string;
  loadErrorMessage?: string | null;
  onClose: () => void;
  onAdd: (branchName: string, trunkBranch: string) => Promise<void>;
}

const NewWorkspaceModal: React.FC<NewWorkspaceModalProps> = ({
  isOpen,
  projectName,
  branches,
  defaultTrunkBranch,
  loadErrorMessage,
  onClose,
  onAdd,
}) => {
  const [branchName, setBranchName] = useState("");
  const [trunkBranch, setTrunkBranch] = useState(defaultTrunkBranch ?? branches[0] ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const infoId = useId();
  const hasBranches = branches.length > 0;

  useEffect(() => {
    setError(loadErrorMessage ?? null);
  }, [loadErrorMessage]);

  useEffect(() => {
    const fallbackTrunk = defaultTrunkBranch ?? branches[0] ?? "";
    setTrunkBranch((current) => {
      const trimmedCurrent = current.trim();

      if (!hasBranches) {
        return trimmedCurrent.length === 0 ? fallbackTrunk : current;
      }

      if (trimmedCurrent.length === 0 || !branches.includes(trimmedCurrent)) {
        return fallbackTrunk;
      }

      return current;
    });
  }, [branches, defaultTrunkBranch, hasBranches]);

  const handleCancel = () => {
    setBranchName("");
    setTrunkBranch(defaultTrunkBranch ?? branches[0] ?? "");
    setError(loadErrorMessage ?? null);
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
      setTrunkBranch(defaultTrunkBranch ?? branches[0] ?? "");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create workspace";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

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
          <label htmlFor="branchName">
            <TooltipWrapper inline>
              <UnderlinedLabel>Workspace Branch Name:</UnderlinedLabel>
              <Tooltip width="wide" position="bottom" interactive>
                <strong>About Workspaces:</strong>
                <ul style={{ margin: "4px 0", paddingLeft: "16px" }}>
                  <li>Uses git worktrees (separate directories sharing .git)</li>
                  <li>All committed changes visible across all worktrees</li>
                  <li>Agent can switch branches freely during session</li>
                  <li>Define branching strategy in AGENTS.md</li>
                </ul>
                <a href="https://cmux.io/workspaces.html" target="_blank" rel="noopener noreferrer">
                  Learn more
                </a>
              </Tooltip>
            </TooltipWrapper>
          </label>
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
          {hasBranches ? (
            <select
              id="trunkBranch"
              value={trunkBranch}
              onChange={(event) => setTrunkBranch(event.target.value)}
              disabled={isLoading}
              required
              aria-required="true"
            >
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="trunkBranch"
              type="text"
              value={trunkBranch}
              onChange={(event) => setTrunkBranch(event.target.value)}
              disabled={isLoading}
              placeholder="Enter trunk branch (e.g., main)"
              required
              aria-required="true"
            />
          )}
          {!hasBranches && (
            <ErrorMessage>
              No branches were detected automatically. Enter the trunk branch manually.
            </ErrorMessage>
          )}
        </FormGroup>

        <ModalInfo id={infoId}>
          <p>This will create a git worktree at:</p>
          <InfoCode>
            ~/.cmux/src/{projectName}/{branchName || "<branch-name>"}
          </InfoCode>
        </ModalInfo>

        {branchName.trim() && (
          <div>
            <CommandLabel>Equivalent command:</CommandLabel>
            <CommandDisplay>
              {formatNewCommand(branchName.trim(), trunkBranch.trim() || undefined)}
            </CommandDisplay>
          </div>
        )}

        <ModalActions>
          <CancelButton type="button" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </CancelButton>
          <PrimaryButton
            type="submit"
            disabled={
              isLoading || branchName.trim().length === 0 || trunkBranch.trim().length === 0
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

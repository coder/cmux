import React, { useEffect, useId, useState } from "react";
import { Modal, ModalInfo, ModalActions, CancelButton, PrimaryButton } from "./Modal";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { formatNewCommand } from "@/utils/chatCommands";

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
        <div className="mb-5 [&_label]:block [&_label]:mb-2 [&_label]:text-foreground [&_label]:text-sm [&_input]:w-full [&_input]:py-2 [&_input]:px-3 [&_input]:bg-modal-bg [&_input]:border [&_input]:border-[#444] [&_input]:rounded [&_input]:text-white [&_input]:text-sm [&_input]:focus:outline-none [&_input]:focus:border-accent [&_input]:disabled:opacity-60 [&_input]:disabled:cursor-not-allowed [&_select]:w-full [&_select]:py-2 [&_select]:px-3 [&_select]:bg-modal-bg [&_select]:border [&_select]:border-[#444] [&_select]:rounded [&_select]:text-white [&_select]:text-sm [&_select]:focus:outline-none [&_select]:focus:border-accent [&_select]:disabled:opacity-60 [&_select]:disabled:cursor-not-allowed [&_select]:cursor-pointer [&_option]:bg-modal-bg [&_option]:text-white">
          <label htmlFor="branchName">
            <TooltipWrapper inline>
              <span className="underline decoration-dotted decoration-[#666] underline-offset-2 cursor-help">
                Workspace Branch Name:
              </span>
              <Tooltip width="wide" position="bottom" interactive>
                <strong>About Workspaces:</strong>
                <ul className="my-1 pl-4">
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
          {error && <div className="text-[#ff5555] text-[13px] mt-1.5">{error}</div>}
        </div>

        <div className="mb-5 [&_label]:block [&_label]:mb-2 [&_label]:text-foreground [&_label]:text-sm [&_input]:w-full [&_input]:py-2 [&_input]:px-3 [&_input]:bg-modal-bg [&_input]:border [&_input]:border-[#444] [&_input]:rounded [&_input]:text-white [&_input]:text-sm [&_input]:focus:outline-none [&_input]:focus:border-accent [&_input]:disabled:opacity-60 [&_input]:disabled:cursor-not-allowed [&_select]:w-full [&_select]:py-2 [&_select]:px-3 [&_select]:bg-modal-bg [&_select]:border [&_select]:border-[#444] [&_select]:rounded [&_select]:text-white [&_select]:text-sm [&_select]:focus:outline-none [&_select]:focus:border-accent [&_select]:disabled:opacity-60 [&_select]:disabled:cursor-not-allowed [&_select]:cursor-pointer [&_option]:bg-modal-bg [&_option]:text-white">
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
            <div className="text-[#ff5555] text-[13px] mt-1.5">
              No branches were detected automatically. Enter the trunk branch manually.
            </div>
          )}
        </div>

        <ModalInfo id={infoId}>
          <p>This will create a git worktree at:</p>
          <code className="block break-all">
            ~/.cmux/src/{projectName}/{branchName || "<branch-name>"}
          </code>
        </ModalInfo>

        {branchName.trim() && (
          <div>
            <div className="text-xs text-muted mb-2 font-sans">Equivalent command:</div>
            <div className="mt-5 p-3 bg-bg-dark border border-border-light rounded font-mono text-[13px] text-text-light whitespace-pre-wrap break-all">
              {formatNewCommand(branchName.trim(), trunkBranch.trim() || undefined)}
            </div>
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

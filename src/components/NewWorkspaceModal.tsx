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
  onAdd: (branchName: string, trunkBranch: string, runtime?: string) => Promise<void>;
}

// Shared form field styles
const formFieldClasses =
  "[&_label]:text-foreground [&_input]:bg-modal-bg [&_input]:border-border-medium [&_input]:focus:border-accent [&_select]:bg-modal-bg [&_select]:border-border-medium [&_select]:focus:border-accent [&_option]:bg-modal-bg mb-5 [&_input]:w-full [&_input]:rounded [&_input]:border [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:text-white [&_input]:focus:outline-none [&_input]:disabled:cursor-not-allowed [&_input]:disabled:opacity-60 [&_label]:mb-2 [&_label]:block [&_label]:text-sm [&_option]:text-white [&_select]:w-full [&_select]:cursor-pointer [&_select]:rounded [&_select]:border [&_select]:px-3 [&_select]:py-2 [&_select]:text-sm [&_select]:text-white [&_select]:focus:outline-none [&_select]:disabled:cursor-not-allowed [&_select]:disabled:opacity-60";

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
  const [runtimeMode, setRuntimeMode] = useState<"local" | "ssh">("local");
  const [sshHost, setSshHost] = useState("");
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
    setRuntimeMode("local");
    setSshHost("");
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

    // Validate SSH host if SSH runtime selected
    if (runtimeMode === "ssh") {
      const trimmedHost = sshHost.trim();
      if (trimmedHost.length === 0) {
        setError("SSH host is required (e.g., hostname or user@host)");
        return;
      }
      // Accept both "hostname" and "user@hostname" formats
      // SSH will use current user or ~/.ssh/config if user not specified
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build runtime string if SSH selected
      const runtime = runtimeMode === "ssh" ? `ssh ${sshHost.trim()}` : undefined;
      
      await onAdd(trimmedBranchName, normalizedTrunkBranch, runtime);
      setBranchName("");
      setTrunkBranch(defaultTrunkBranch ?? branches[0] ?? "");
      setRuntimeMode("local");
      setSshHost("");
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
        <div className={formFieldClasses}>
          <label htmlFor="branchName">
            <TooltipWrapper inline>
              <span className="cursor-help underline decoration-[#666] decoration-dotted underline-offset-2">
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
          {error && <div className="text-danger-light mt-1.5 text-[13px]">{error}</div>}
        </div>

        <div className={formFieldClasses}>
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
            <div className="text-danger-light mt-1.5 text-[13px]">
              No branches were detected automatically. Enter the trunk branch manually.
            </div>
          )}
        </div>

        <div className={formFieldClasses}>
          <label htmlFor="runtimeMode">Runtime:</label>
          <select
            id="runtimeMode"
            value={runtimeMode}
            onChange={(event) => {
              setRuntimeMode(event.target.value as "local" | "ssh");
              setError(null);
            }}
            disabled={isLoading}
          >
            <option value="local">Local</option>
            <option value="ssh">SSH Remote</option>
          </select>
        </div>

        {runtimeMode === "ssh" && (
          <div className={formFieldClasses}>
            <label htmlFor="sshHost">SSH Host:</label>
            <input
              id="sshHost"
              type="text"
              value={sshHost}
              onChange={(event) => {
                setSshHost(event.target.value);
                setError(null);
              }}
              placeholder="hostname or user@hostname"
              disabled={isLoading}
              required
              aria-required="true"
            />
            <div className="text-muted mt-1.5 text-[13px]">
              Workspace will be created at ~/cmux/{branchName || "<branch-name>"} on remote host
            </div>
          </div>
        )}

        <ModalInfo id={infoId}>
          <p>This will create a git worktree at:</p>
          <code className="block break-all">
            {runtimeMode === "ssh"
              ? `${sshHost || "<host>"}:~/cmux/${branchName || "<branch-name>"}`
              : `~/.cmux/src/${projectName}/${branchName || "<branch-name>"}`}
          </code>
        </ModalInfo>

        {branchName.trim() && (
          <div>
            <div className="text-muted mb-2 font-sans text-xs">Equivalent command:</div>
            <div className="bg-dark border-border-light text-light mt-5 rounded border p-3 font-mono text-[13px] break-all whitespace-pre-wrap">
              {formatNewCommand(
                branchName.trim(),
                trunkBranch.trim() || undefined,
                runtimeMode === "ssh" && sshHost.trim() ? `ssh ${sshHost.trim()}` : undefined
              )}
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

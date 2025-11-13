import React from "react";
import { RUNTIME_MODE } from "@/types/runtime";
import { TooltipWrapper, Tooltip } from "../Tooltip";

interface CreationControlsProps {
  branches: string[];
  trunkBranch: string;
  onTrunkBranchChange: (branch: string) => void;
  runtimeMode: typeof RUNTIME_MODE.LOCAL | typeof RUNTIME_MODE.SSH;
  sshHost: string;
  onRuntimeChange: (
    mode: typeof RUNTIME_MODE.LOCAL | typeof RUNTIME_MODE.SSH,
    host: string
  ) => void;
  disabled: boolean;
}

/**
 * Additional controls shown only during workspace creation
 * - Trunk branch selector (which branch to fork from)
 * - Runtime mode (local vs SSH)
 */
export function CreationControls({
  branches,
  trunkBranch,
  onTrunkBranchChange,
  runtimeMode,
  sshHost,
  onRuntimeChange,
  disabled,
}: CreationControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* Trunk Branch Selector */}
      {branches.length > 0 && (
        <div className="flex items-center gap-1" data-component="TrunkBranchGroup">
          <label htmlFor="trunk-branch" className="text-muted text-xs">
            From:
          </label>
          <select
            id="trunk-branch"
            value={trunkBranch}
            onChange={(e) => onTrunkBranchChange(e.target.value)}
            disabled={disabled}
            className="bg-separator text-foreground border-border-medium focus:border-accent max-w-[120px] rounded border px-2 py-1 text-xs focus:outline-none disabled:opacity-50"
          >
            {branches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Runtime Selector */}
      <div className="flex items-center gap-1" data-component="RuntimeSelectorGroup">
        <label className="text-muted text-xs">Runtime:</label>
        <select
          value={runtimeMode}
          onChange={(e) => {
            const newMode = e.target.value as
              | typeof RUNTIME_MODE.LOCAL
              | typeof RUNTIME_MODE.SSH;
            onRuntimeChange(newMode, newMode === RUNTIME_MODE.LOCAL ? "" : sshHost);
          }}
          disabled={disabled}
          className="bg-separator text-foreground border-border-medium focus:border-accent rounded border px-2 py-1 text-xs focus:outline-none disabled:opacity-50"
        >
          <option value={RUNTIME_MODE.LOCAL}>Local</option>
          <option value={RUNTIME_MODE.SSH}>SSH Remote</option>
        </select>
        {runtimeMode === RUNTIME_MODE.SSH && (
          <input
            type="text"
            value={sshHost}
            onChange={(e) => onRuntimeChange(RUNTIME_MODE.SSH, e.target.value)}
            placeholder="user@host"
            disabled={disabled}
            className="bg-separator text-foreground border-border-medium focus:border-accent w-32 rounded border px-2 py-1 text-xs focus:outline-none disabled:opacity-50"
          />
        )}
        <TooltipWrapper inline>
          <span className="text-muted cursor-help text-xs">?</span>
          <Tooltip className="tooltip" align="center" width="wide">
            <strong>Runtime:</strong>
            <br />
            • Local: git worktree in ~/.cmux/src
            <br />• SSH: remote clone in ~/cmux on SSH host
          </Tooltip>
        </TooltipWrapper>
      </div>
    </div>
  );
}

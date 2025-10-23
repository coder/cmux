/**
 * ReviewControls - Consolidated one-line control bar for review panel
 */

import React, { useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { ReviewFilters, ReviewStats } from "@/types/review";
import { RefreshButton } from "./RefreshButton";
import { UntrackedStatus } from "./UntrackedStatus";

interface ReviewControlsProps {
  filters: ReviewFilters;
  stats: ReviewStats;
  onFiltersChange: (filters: ReviewFilters) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  workspaceId: string;
  workspacePath: string;
  refreshTrigger?: number;
}

export const ReviewControls: React.FC<ReviewControlsProps> = ({
  filters,
  stats,
  onFiltersChange,
  onRefresh,
  isLoading = false,
  workspaceId,
  workspacePath,
  refreshTrigger,
}) => {
  // Local state for input value - only commit on blur/Enter
  const [inputValue, setInputValue] = useState(filters.diffBase);

  // Global default base (used for new workspaces)
  const [defaultBase, setDefaultBase] = usePersistedState<string>("review-default-base", "HEAD");

  // Sync input with external changes (e.g., workspace change)
  React.useEffect(() => {
    setInputValue(filters.diffBase);
  }, [filters.diffBase]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const commitValue = () => {
    const trimmed = inputValue.trim();
    if (trimmed && trimmed !== filters.diffBase) {
      onFiltersChange({ ...filters, diffBase: trimmed });
    }
  };

  const handleBaseBlur = () => {
    commitValue();
  };

  const handleBaseKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitValue();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      // Revert to committed value
      setInputValue(filters.diffBase);
      e.currentTarget.blur();
    }
  };

  const handleUncommittedToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, includeUncommitted: e.target.checked });
  };

  const handleShowReadToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, showReadHunks: e.target.checked });
  };

  const handleSetDefault = () => {
    setDefaultBase(filters.diffBase);
  };

  // Show "Set Default" button if current base is different from default
  const showSetDefault = filters.diffBase !== defaultBase;

  return (
    <div className="py-2 px-3 bg-[#252526] border-b border-[#3e3e42] flex gap-3 items-center flex-wrap text-[11px]">
      {onRefresh && <RefreshButton onClick={onRefresh} isLoading={isLoading} />}
      <label className="text-[#888] font-medium whitespace-nowrap">Base:</label>
      <input
        type="text"
        list="base-suggestions"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBaseBlur}
        onKeyDown={handleBaseKeyDown}
        placeholder="HEAD, main, etc."
        className="py-1 px-2 bg-[#1e1e1e] text-[#ccc] border border-[#444] rounded text-[11px] font-mono w-[140px] transition-[border-color] duration-200 hover:border-[#007acc] focus:outline-none focus:border-[#007acc] placeholder:text-[#666]"
      />
      <datalist id="base-suggestions">
        <option value="HEAD" />
        <option value="--staged" />
        <option value="main" />
        <option value="origin/main" />
        <option value="HEAD~1" />
        <option value="HEAD~2" />
        <option value="develop" />
        <option value="origin/develop" />
      </datalist>

      {showSetDefault && (
        <button
          onClick={handleSetDefault}
          className="py-0.5 px-2 bg-transparent text-[#888] border-none rounded text-[11px] cursor-pointer transition-all duration-200 font-primary whitespace-nowrap hover:bg-[rgba(255,255,255,0.05)] hover:text-[#ccc]"
        >
          Set Default
        </button>
      )}

      <label className="flex items-center gap-1.5 text-[#ccc] text-[11px] cursor-pointer whitespace-nowrap hover:text-white [&_input[type='checkbox']]:cursor-pointer">
        <input
          type="checkbox"
          checked={filters.includeUncommitted}
          onChange={handleUncommittedToggle}
        />
        Uncommitted
      </label>

      <label className="flex items-center gap-1.5 text-[#ccc] text-[11px] cursor-pointer whitespace-nowrap hover:text-white [&_input[type='checkbox']]:cursor-pointer">
        <input type="checkbox" checked={filters.showReadHunks} onChange={handleShowReadToggle} />
        Show read
      </label>

      <UntrackedStatus
        workspaceId={workspaceId}
        workspacePath={workspacePath}
        refreshTrigger={refreshTrigger}
        onRefresh={onRefresh}
      />

      <div className="w-px h-4 bg-[#3e3e42]" />

      <div className="py-1 px-2.5 rounded font-medium text-[11px] bg-transparent border border-transparent whitespace-nowrap text-[#888]">
        {stats.read} read / {stats.total} total
      </div>
    </div>
  );
};

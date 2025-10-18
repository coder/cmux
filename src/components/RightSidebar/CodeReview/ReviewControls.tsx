/**
 * ReviewControls - Consolidated one-line control bar for review panel
 */

import React, { useState } from "react";
import styled from "@emotion/styled";
import { TooltipWrapper, Tooltip } from "@/components/Tooltip";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { ReviewFilters, ReviewStats } from "@/types/review";

interface ReviewControlsProps {
  filters: ReviewFilters;
  stats: ReviewStats;
  onFiltersChange: (filters: ReviewFilters) => void;
  onRefresh?: () => void;
}

const ControlsContainer = styled.div`
  padding: 8px 12px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11px;
`;

const Label = styled.label`
  color: #888;
  font-weight: 500;
  white-space: nowrap;
`;

const BaseInput = styled.input`
  padding: 4px 8px;
  background: #1e1e1e;
  color: #ccc;
  border: 1px solid #444;
  border-radius: 3px;
  font-size: 11px;
  font-family: var(--font-monospace);
  width: 140px;
  transition: border-color 0.2s ease;

  &:hover {
    border-color: #007acc;
  }

  &:focus {
    outline: none;
    border-color: #007acc;
  }

  &::placeholder {
    color: #666;
  }
`;

const StatBadge = styled.div`
  padding: 4px 10px;
  border-radius: 3px;
  font-weight: 500;
  font-size: 11px;
  background: transparent;
  border: 1px solid transparent;
  white-space: nowrap;
  color: #888;
`;

const Separator = styled.div`
  width: 1px;
  height: 16px;
  background: #3e3e42;
`;

const RefreshButton = styled.button`
  background: transparent;
  border: none;
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  transition: color 0.2s ease;
  
  &:hover {
    color: #ccc;
  }
  
  svg {
    width: 12px;
    height: 12px;
  }
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  
  &:hover {
    color: #fff;
  }
  
  input[type="checkbox"] {
    cursor: pointer;
  }
`;

const SetDefaultButton = styled.button`
  padding: 2px 8px;
  background: transparent;
  color: #888;
  border: none;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);
  white-space: nowrap;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ccc;
  }
`;

export const ReviewControls: React.FC<ReviewControlsProps> = ({
  filters,
  stats,
  onFiltersChange,
  onRefresh,
}) => {
  // Local state for input value - only commit on blur/Enter
  const [inputValue, setInputValue] = useState(filters.diffBase);
  
  // Global default base (used for new workspaces)
  const [defaultBase, setDefaultBase] = usePersistedState<string>(
    "review-default-base",
    "HEAD"
  );

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

  const handleDirtyToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, includeDirty: e.target.checked });
  };
  
  const handleSetDefault = () => {
    setDefaultBase(filters.diffBase);
  };
  
  // Show "Set Default" button if current base is different from default
  const showSetDefault = filters.diffBase !== defaultBase;

  return (
    <ControlsContainer>
      {onRefresh && (
        <TooltipWrapper inline>
          <RefreshButton onClick={onRefresh}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
          </RefreshButton>
          <Tooltip position="bottom" align="left">
            Refresh diff
          </Tooltip>
        </TooltipWrapper>
      )}
      <Label>Base:</Label>
      <BaseInput
        type="text"
        list="base-suggestions"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBaseBlur}
        onKeyDown={handleBaseKeyDown}
        placeholder="HEAD, main, etc."
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
        <SetDefaultButton onClick={handleSetDefault}>
          Set Default
        </SetDefaultButton>
      )}

      <CheckboxLabel>
        <input
          type="checkbox"
          checked={filters.includeDirty}
          onChange={handleDirtyToggle}
        />
        Include dirty
      </CheckboxLabel>

      <Separator />

      <StatBadge>
        {stats.total} {stats.total === 1 ? 'hunk' : 'hunks'}
      </StatBadge>
    </ControlsContainer>
  );
};


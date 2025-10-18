/**
 * ReviewControls - Consolidated one-line control bar for review panel
 */

import React, { useState } from "react";
import styled from "@emotion/styled";
import type { ReviewFilters, ReviewStats } from "@/types/review";

interface ReviewControlsProps {
  filters: ReviewFilters;
  stats: ReviewStats;
  onFiltersChange: (filters: ReviewFilters) => void;
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

const StatBadge = styled.button<{
  variant?: "accepted" | "rejected" | "unreviewed" | "total";
  active?: boolean;
}>`
  padding: 4px 10px;
  border-radius: 3px;
  font-weight: 500;
  font-size: 11px;
  background: ${(props) => (props.active ? "#1e1e1e" : "transparent")};
  border: 1px solid ${(props) => (props.active ? "#3e3e42" : "transparent")};
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  ${(props) => {
    if (props.variant === "accepted") {
      return `
        color: #4ec9b0;
        &:hover {
          background: rgba(78, 201, 176, 0.1);
          border-color: rgba(78, 201, 176, 0.3);
        }
        ${
          props.active
            ? `
          background: rgba(78, 201, 176, 0.15);
          border-color: rgba(78, 201, 176, 0.4);
        `
            : ""
        }
      `;
    } else if (props.variant === "rejected") {
      return `
        color: #f48771;
        &:hover {
          background: rgba(244, 135, 113, 0.1);
          border-color: rgba(244, 135, 113, 0.3);
        }
        ${
          props.active
            ? `
          background: rgba(244, 135, 113, 0.15);
          border-color: rgba(244, 135, 113, 0.4);
        `
            : ""
        }
      `;
    } else if (props.variant === "unreviewed") {
      return `
        color: #ccc;
        &:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: #444;
        }
        ${
          props.active
            ? `
          background: rgba(255, 255, 255, 0.08);
          border-color: #555;
        `
            : ""
        }
      `;
    } else {
      return `
        color: #888;
        &:hover {
          background: rgba(255, 255, 255, 0.03);
        }
      `;
    }
  }}
`;

const Separator = styled.div`
  width: 1px;
  height: 16px;
  background: #3e3e42;
`;

export const ReviewControls: React.FC<ReviewControlsProps> = ({
  filters,
  stats,
  onFiltersChange,
}) => {
  // Local state for input value - only commit on blur/Enter
  const [inputValue, setInputValue] = useState(filters.diffBase);

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

  const handleStatusFilter = (status: ReviewFilters["statusFilter"]) => {
    onFiltersChange({ ...filters, statusFilter: status });
  };

  return (
    <ControlsContainer>
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

      <Separator />

      <StatBadge
        variant="unreviewed"
        active={filters.statusFilter === "unreviewed"}
        onClick={() => handleStatusFilter("unreviewed")}
      >
        {stats.unreviewed} unreviewed
      </StatBadge>
      <StatBadge
        variant="accepted"
        active={filters.statusFilter === "accepted"}
        onClick={() => handleStatusFilter("accepted")}
      >
        {stats.accepted} accepted
      </StatBadge>
      <StatBadge
        variant="rejected"
        active={filters.statusFilter === "rejected"}
        onClick={() => handleStatusFilter("rejected")}
      >
        {stats.rejected} rejected
      </StatBadge>
      <StatBadge
        variant="total"
        active={filters.statusFilter === "all"}
        onClick={() => handleStatusFilter("all")}
      >
        {stats.total} total
      </StatBadge>
    </ControlsContainer>
  );
};


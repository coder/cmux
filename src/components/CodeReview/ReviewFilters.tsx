/**
 * ReviewFilters - Filter controls for the review panel
 */

import React from "react";
import styled from "@emotion/styled";
import type { ReviewFilters as ReviewFiltersType, ReviewStats } from "@/types/review";

interface ReviewFiltersProps {
  filters: ReviewFiltersType;
  stats: ReviewStats;
  onFiltersChange: (filters: ReviewFiltersType) => void;
}

const FiltersContainer = styled.div`
  padding: 12px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const StatsRow = styled.div`
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #888;
`;

const StatBadge = styled.div<{ variant?: "accepted" | "rejected" | "unreviewed" }>`
  padding: 3px 8px;
  border-radius: 3px;
  font-weight: 500;
  background: #1e1e1e;
  border: 1px solid #3e3e42;

  ${(props) => {
    if (props.variant === "accepted") {
      return `
        color: #4ec9b0;
        border-color: rgba(78, 201, 176, 0.3);
      `;
    } else if (props.variant === "rejected") {
      return `
        color: #f48771;
        border-color: rgba(244, 135, 113, 0.3);
      `;
    } else if (props.variant === "unreviewed") {
      return `
        color: #ccc;
      `;
    }
    return "";
  }}
`;

const FilterRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const ToggleButton = styled.button<{ active: boolean }>`
  padding: 6px 12px;
  background: ${(props) => (props.active ? "#007acc" : "#333")};
  color: ${(props) => (props.active ? "#fff" : "#888")};
  border: 1px solid ${(props) => (props.active ? "#007acc" : "#444")};
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);

  &:hover {
    background: ${(props) => (props.active ? "#005a9e" : "#444")};
    color: #ccc;
  }
`;

const StatusFilterGroup = styled.div`
  display: flex;
  gap: 4px;
  border: 1px solid #444;
  border-radius: 4px;
  overflow: hidden;
`;

const StatusFilterButton = styled.button<{ active: boolean }>`
  padding: 6px 10px;
  background: ${(props) => (props.active ? "#007acc" : "transparent")};
  color: ${(props) => (props.active ? "#fff" : "#888")};
  border: none;
  border-right: 1px solid #444;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);

  &:last-child {
    border-right: none;
  }

  &:hover {
    background: ${(props) => (props.active ? "#005a9e" : "#333")};
    color: #ccc;
  }
`;

export const ReviewFilters: React.FC<ReviewFiltersProps> = ({ filters, stats, onFiltersChange }) => {
  const handleShowReviewedToggle = () => {
    onFiltersChange({
      ...filters,
      showReviewed: !filters.showReviewed,
    });
  };

  const handleStatusFilterChange = (status: ReviewFiltersType["statusFilter"]) => {
    onFiltersChange({
      ...filters,
      statusFilter: status,
    });
  };

  return (
    <FiltersContainer>
      <StatsRow>
        <StatBadge variant="unreviewed">
          {stats.unreviewed} unreviewed
        </StatBadge>
        <StatBadge variant="accepted">
          {stats.accepted} accepted
        </StatBadge>
        <StatBadge variant="rejected">
          {stats.rejected} rejected
        </StatBadge>
        <StatBadge>
          {stats.total} total
        </StatBadge>
      </StatsRow>

      <FilterRow>
        <ToggleButton active={filters.showReviewed} onClick={handleShowReviewedToggle}>
          {filters.showReviewed ? "Hide Reviewed" : "Show Reviewed"}
        </ToggleButton>

        <StatusFilterGroup>
          <StatusFilterButton
            active={filters.statusFilter === "all"}
            onClick={() => handleStatusFilterChange("all")}
          >
            All
          </StatusFilterButton>
          <StatusFilterButton
            active={filters.statusFilter === "unreviewed"}
            onClick={() => handleStatusFilterChange("unreviewed")}
          >
            Unreviewed
          </StatusFilterButton>
          <StatusFilterButton
            active={filters.statusFilter === "accepted"}
            onClick={() => handleStatusFilterChange("accepted")}
          >
            Accepted
          </StatusFilterButton>
          <StatusFilterButton
            active={filters.statusFilter === "rejected"}
            onClick={() => handleStatusFilterChange("rejected")}
          >
            Rejected
          </StatusFilterButton>
        </StatusFilterGroup>
      </FilterRow>
    </FiltersContainer>
  );
};


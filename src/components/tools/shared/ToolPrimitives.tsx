import styled from "@emotion/styled";

/**
 * Shared styled components for tool UI
 * These primitives provide consistent styling across all tool components
 */

export const ToolContainer = styled.div<{ expanded: boolean }>`
  margin: 8px 0;
  padding: ${(props) => (props.expanded ? "8px 12px" : "4px 12px")};
  background: rgba(100, 100, 100, 0.05);
  border-radius: 4px;
  font-family: var(--font-monospace);
  font-size: 11px;
  transition: all 0.2s ease;
  container-type: inline-size; /* Enable container queries */
`;

export const ToolHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  color: var(--color-text-secondary);

  &:hover {
    color: var(--color-text);
  }
`;

export const ExpandIcon = styled.span<{ expanded: boolean }>`
  display: inline-block;
  transition: transform 0.2s ease;
  transform: ${(props) => (props.expanded ? "rotate(90deg)" : "rotate(0deg)")};
  font-size: 10px;
`;

export const ToolName = styled.span`
  font-weight: 500;
`;

export const StatusIndicator = styled.span<{ status: string }>`
  font-size: 10px;
  margin-left: auto;
  opacity: 0.8;
  white-space: nowrap;
  flex-shrink: 0;
  color: ${({ status }) => {
    switch (status) {
      case "executing":
        return "var(--color-pending)";
      case "completed":
        return "#4caf50";
      case "failed":
        return "#f44336";
      case "interrupted":
        return "var(--color-interrupted)";
      default:
        return "var(--color-text-secondary)";
    }
  }};

  .status-text {
    display: inline;
  }

  /* Hide text on narrow containers, show only icon */
  @container (max-width: 500px) {
    .status-text {
      display: none;
    }
  }
`;

export const ToolDetails = styled.div`
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  color: var(--color-text);
`;

export const DetailSection = styled.div`
  margin: 6px 0;
`;

export const DetailLabel = styled.div`
  font-size: 10px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

export const DetailContent = styled.pre`
  margin: 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
`;

export const LoadingDots = styled.span`
  &::after {
    content: "...";
    animation: dots 1.5s infinite;
  }

  @keyframes dots {
    0%,
    20% {
      content: ".";
    }
    40% {
      content: "..";
    }
    60%,
    100% {
      content: "...";
    }
  }
`;

export const HeaderButton = styled.button<{ active?: boolean }>`
  background: ${(props) => (props.active ? "rgba(255, 255, 255, 0.1)" : "none")};
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #cccccc;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
  }
`;

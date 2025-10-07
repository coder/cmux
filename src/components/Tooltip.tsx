import styled from "@emotion/styled";

// Centralized Tooltip components
interface TooltipWrapperProps {
  inline?: boolean;
}

export const TooltipWrapper = styled.span<TooltipWrapperProps>`
  position: relative;
  display: ${(props) => (props.inline ? "inline-block" : "block")};

  &:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }
`;

interface TooltipProps {
  align?: "left" | "center" | "right";
  width?: "auto" | "wide";
  position?: "top" | "bottom";
}

export const Tooltip = styled.span<TooltipProps>`
  visibility: hidden;
  opacity: 0;
  background-color: #2d2d30;
  color: #cccccc;
  text-align: ${(props) => props.align ?? "left"};
  border-radius: 4px;
  padding: 6px 10px;
  position: absolute;
  z-index: 9999;
  ${(props) => (props.position === "bottom" ? "top: 125%;" : "bottom: 125%;")}
  ${(props) => {
    if (props.align === "right") return "right: 0;";
    if (props.align === "left") return "left: 0;";
    return "left: 50%; transform: translateX(-50%);";
  }}
  white-space: ${(props) => (props.width === "wide" ? "normal" : "nowrap")};
  ${(props) => props.width === "wide" && "max-width: 300px; width: max-content;"}
  font-size: 11px;
  font-weight: normal;
  font-family: var(--font-primary);
  border: 1px solid #464647;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: opacity 0.2s;
  pointer-events: none;

  &::after {
    content: "";
    position: absolute;
    ${(props) => (props.position === "bottom" ? "bottom: 100%;" : "top: 100%;")}
    ${(props) => {
      if (props.align === "right") return "right: 10px;";
      if (props.align === "left") return "left: 10px;";
      return "left: 50%; transform: translateX(-50%);";
    }}
    border-width: 5px;
    border-style: solid;
    ${(props) =>
      props.position === "bottom"
        ? "border-color: transparent transparent #2d2d30 transparent;"
        : "border-color: #2d2d30 transparent transparent transparent;"}
  }
`;

export const HelpIndicator = styled.span`
  color: #666666;
  font-size: 8px;
  cursor: help;
  display: inline-block;
  vertical-align: baseline;
  border: 1px solid #666666;
  border-radius: 50%;
  width: 11px;
  height: 11px;
  line-height: 9px;
  text-align: center;
  font-weight: bold;
  margin-bottom: 2px;
`;

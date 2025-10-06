import React, { useState, useEffect, useCallback } from "react";
import styled from "@emotion/styled";
import { HeaderButton } from "../tools/shared/ToolPrimitives";

const ButtonWrapper = styled.span`
  position: relative;
  display: inline-block;

  &:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }
`;

const Button = styled(HeaderButton)<{ isEnabled: boolean }>`
  opacity: ${(props) => (props.isEnabled ? "1" : "0.5")};
  cursor: ${(props) => (props.isEnabled ? "pointer" : "not-allowed")};
  border-color: ${(props) =>
    props.isEnabled ? "var(--color-editing-mode)" : "rgba(255, 255, 255, 0.2)"};

  &:hover {
    border-color: ${(props) =>
      props.isEnabled ? "var(--color-editing-mode)" : "rgba(255, 255, 255, 0.2)"};
  }
`;

const Tooltip = styled.span<{ isWarning: boolean }>`
  visibility: hidden;
  opacity: 0;
  background-color: #2d2d30;
  color: ${(props) => (props.isWarning ? "var(--color-editing-mode)" : "#cccccc")};
  text-align: center;
  border-radius: 4px;
  padding: 6px 10px;
  position: absolute;
  z-index: 9999;
  top: 125%;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 11px;
  font-weight: ${(props) => (props.isWarning ? "500" : "normal")};
  font-family: var(--font-primary);
  border: 1px solid ${(props) => (props.isWarning ? "var(--color-editing-mode)" : "#464647")};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: opacity 0.2s;
  pointer-events: none;

  &::after {
    content: "";
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-width: 5px;
    border-style: solid;
    border-color: ${(props) =>
      props.isWarning
        ? "transparent transparent var(--color-editing-mode) transparent"
        : "transparent transparent #2d2d30 transparent"};
  }
`;

interface StartHereButtonProps {
  onComplete: () => void;
  className?: string;
}

export const StartHereButton: React.FC<StartHereButtonProps> = ({ onComplete, className }) => {
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Shift") {
      setIsShiftPressed(true);
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === "Shift") {
      setIsShiftPressed(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const handleClick = () => {
    if (isShiftPressed) {
      onComplete();
    }
  };

  const tooltipText = isShiftPressed
    ? "⚠️ Click to remove messages above this line"
    : "Hold Shift and click to truncate history";

  return (
    <ButtonWrapper>
      <Tooltip className="tooltip" isWarning={isShiftPressed}>
        {tooltipText}
      </Tooltip>
      <Button
        isEnabled={isShiftPressed}
        disabled={!isShiftPressed}
        onClick={handleClick}
        className={className}
      >
        Start Here
      </Button>
    </ButtonWrapper>
  );
};

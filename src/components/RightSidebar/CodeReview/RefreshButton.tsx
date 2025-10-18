/**
 * RefreshButton - Animated refresh button with graceful spin-down
 */

import React, { useState, useRef, useEffect } from "react";
import styled from "@emotion/styled";
import { TooltipWrapper, Tooltip } from "@/components/Tooltip";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";

interface RefreshButtonProps {
  onClick: () => void;
  isLoading?: boolean;
}

const Button = styled.button<{ $isLoading?: boolean }>`
  background: transparent;
  border: none;
  padding: 2px;
  cursor: ${(props) => (props.$isLoading ? "default" : "pointer")};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => (props.$isLoading ? "#007acc" : "#888")};
  transition: color 0.8s ease-out;

  &:hover {
    color: ${(props) => (props.$isLoading ? "#007acc" : "#ccc")};
  }

  svg {
    width: 12px;
    height: 12px;
  }

  &.spinning svg {
    animation: spin 0.8s linear infinite;
  }

  &.spin-once svg {
    animation: spin-once 0.8s ease-out forwards;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-once {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

export const RefreshButton: React.FC<RefreshButtonProps> = ({ onClick, isLoading = false }) => {
  // Track animation state for graceful stopping
  const [animationState, setAnimationState] = useState<"idle" | "spinning" | "stopping">("idle");
  const spinOnceTimeoutRef = useRef<number | null>(null);

  // Manage animation state based on loading prop
  useEffect(() => {
    if (isLoading) {
      // Start spinning
      setAnimationState("spinning");
      // Clear any pending stop timeout
      if (spinOnceTimeoutRef.current) {
        clearTimeout(spinOnceTimeoutRef.current);
        spinOnceTimeoutRef.current = null;
      }
    } else if (animationState === "spinning") {
      // Gracefully stop: do one final rotation
      setAnimationState("stopping");
      // After animation completes, return to idle
      spinOnceTimeoutRef.current = window.setTimeout(() => {
        setAnimationState("idle");
        spinOnceTimeoutRef.current = null;
      }, 800); // Match animation duration
    }

    return () => {
      if (spinOnceTimeoutRef.current) {
        clearTimeout(spinOnceTimeoutRef.current);
      }
    };
  }, [isLoading, animationState]);

  const className =
    animationState === "spinning" ? "spinning" : animationState === "stopping" ? "spin-once" : "";

  return (
    <TooltipWrapper inline>
      <Button onClick={onClick} $isLoading={isLoading} className={className}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
        </svg>
      </Button>
      <Tooltip position="bottom" align="left">
        {isLoading ? "Refreshing..." : `Refresh diff (${formatKeybind(KEYBINDS.REFRESH_REVIEW)})`}
      </Tooltip>
    </TooltipWrapper>
  );
};

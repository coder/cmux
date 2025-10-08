import React, { useState, useRef, useEffect, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";

// Context for passing hover state and trigger ref from wrapper to tooltip
interface TooltipContextValue {
  isHovered: boolean;
  triggerRef: React.RefObject<HTMLElement> | null;
}

const TooltipContext = createContext<TooltipContextValue>({
  isHovered: false,
  triggerRef: null,
});

// TooltipWrapper - React component that tracks hover state
interface TooltipWrapperProps {
  inline?: boolean;
  children: React.ReactNode;
}

export const TooltipWrapper: React.FC<TooltipWrapperProps> = ({ inline = false, children }) => {
  const [isHovered, setIsHovered] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  return (
    <TooltipContext.Provider value={{ isHovered, triggerRef }}>
      <StyledWrapper
        ref={triggerRef}
        inline={inline}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {children}
      </StyledWrapper>
    </TooltipContext.Provider>
  );
};

const StyledWrapper = styled.span<{ inline: boolean }>`
  position: relative;
  display: ${(props) => (props.inline ? "inline-block" : "block")};
`;

// Tooltip - Portal-based component with collision detection
interface TooltipProps {
  align?: "left" | "center" | "right";
  width?: "auto" | "wide";
  position?: "top" | "bottom";
  children: React.ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  align = "left",
  width = "auto",
  position = "top",
  children,
  className = "tooltip",
}) => {
  const { isHovered, triggerRef } = useContext(TooltipContext);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!isHovered || !triggerRef?.current || !tooltipRef.current) {
      return;
    }

    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top: number;
    let left: number;
    let finalPosition = position;
    const gap = 8; // Gap between trigger and tooltip

    // Vertical positioning with collision detection
    if (position === "bottom") {
      top = trigger.bottom + gap;
      // Check if tooltip would overflow bottom of viewport
      if (top + tooltip.height > viewportHeight) {
        // Flip to top
        finalPosition = "top";
        top = trigger.top - tooltip.height - gap;
      }
    } else {
      // position === "top"
      top = trigger.top - tooltip.height - gap;
      // Check if tooltip would overflow top of viewport
      if (top < 0) {
        // Flip to bottom
        finalPosition = "bottom";
        top = trigger.bottom + gap;
      }
    }

    // Horizontal positioning based on align
    if (align === "left") {
      left = trigger.left;
    } else if (align === "right") {
      left = trigger.right - tooltip.width;
    } else {
      // center
      left = trigger.left + trigger.width / 2 - tooltip.width / 2;
    }

    // Horizontal collision detection
    const minLeft = 8; // Min distance from viewport edge
    const maxLeft = viewportWidth - tooltip.width - 8;
    const originalLeft = left;
    left = Math.max(minLeft, Math.min(maxLeft, left));

    // Calculate arrow position - stays aligned with trigger even if tooltip shifts
    let arrowLeft: number;
    if (align === "center") {
      arrowLeft = trigger.left + trigger.width / 2 - left;
    } else if (align === "right") {
      arrowLeft = tooltip.width - 15; // 10px from right + 5px arrow width
    } else {
      // left
      arrowLeft = Math.max(10, Math.min(originalLeft - left + 10, tooltip.width - 15));
    }

    setStyle({
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      visibility: "visible",
      opacity: 1,
    });

    setArrowStyle({
      left: `${arrowLeft}px`,
      [finalPosition === "bottom" ? "bottom" : "top"]: "100%",
      borderColor:
        finalPosition === "bottom"
          ? "transparent transparent #2d2d30 transparent"
          : "#2d2d30 transparent transparent transparent",
    });
  }, [isHovered, align, position, triggerRef]);

  if (!isHovered) {
    return null;
  }

  return createPortal(
    <StyledTooltip ref={tooltipRef} style={style} width={width} className={className}>
      {children}
      <Arrow style={arrowStyle} />
    </StyledTooltip>,
    document.body
  );
};

const StyledTooltip = styled.div<{ width: string }>`
  background-color: #2d2d30;
  color: #cccccc;
  text-align: left;
  border-radius: 4px;
  padding: 6px 10px;
  z-index: 9999;
  white-space: ${(props) => (props.width === "wide" ? "normal" : "nowrap")};
  ${(props) => props.width === "wide" && "max-width: 300px; width: max-content;"}
  font-size: 11px;
  font-weight: normal;
  font-family: var(--font-primary);
  border: 1px solid #464647;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: opacity 0.2s;
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
`;

const Arrow = styled.div`
  content: "";
  position: absolute;
  border-width: 5px;
  border-style: solid;
  transform: translateX(-50%);
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

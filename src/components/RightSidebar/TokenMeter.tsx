import React from "react";
import styled from "@emotion/styled";
import type { TokenSegment } from "@/utils/tokens/tokenMeterUtils";

interface TokenMeterProps {
  segments: TokenSegment[];
  orientation: "horizontal" | "vertical";
  className?: string;
  style?: React.CSSProperties;
}

const Bar = styled.div<{ orientation: "horizontal" | "vertical" }>`
  background: #3e3e42;
  border-radius: ${(props) => (props.orientation === "horizontal" ? "3px" : "4px")};
  overflow: hidden;
  display: flex;
  flex-direction: ${(props) => (props.orientation === "horizontal" ? "row" : "column")};
  ${(props) =>
    props.orientation === "horizontal" ? "width: 100%; height: 6px;" : "width: 8px; height: 100%;"}
`;

const Segment = styled.div<{
  percentage: number;
  color: string;
  orientation: "horizontal" | "vertical";
}>`
  background: ${(props) => props.color};
  transition: ${(props) => (props.orientation === "horizontal" ? "width" : "flex-grow")} 0.3s ease;
  ${(props) =>
    props.orientation === "horizontal"
      ? `width: ${props.percentage}%; height: 100%;`
      : `flex: ${props.percentage}; width: 100%;`}
`;

const TokenMeterComponent: React.FC<TokenMeterProps> = ({
  segments,
  orientation,
  className,
  style,
  ...rest
}) => {
  return (
    <Bar
      orientation={orientation}
      className={className}
      style={style}
      {...rest}
      data-bar="token-meter"
    >
      {segments.map((seg, i) => (
        <Segment
          key={i}
          percentage={seg.percentage}
          color={seg.color}
          orientation={orientation}
          data-segment={seg.type}
          data-segment-index={i}
          data-segment-percentage={seg.percentage.toFixed(1)}
          data-segment-tokens={seg.tokens}
        />
      ))}
    </Bar>
  );
};

// Memoize to prevent re-renders when props haven't changed
export const TokenMeter = React.memo(TokenMeterComponent);

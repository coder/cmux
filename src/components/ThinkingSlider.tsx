import React from "react";
import styled from "@emotion/styled";
import { ThinkingLevel } from "../types/thinking";
import { usePersistedState } from "../hooks/usePersistedState";

const ThinkingSliderContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 20px;
`;

const ThinkingLabel = styled.span`
  font-size: 10px;
  color: #606060;
  user-select: none;
`;

const ThinkingSlider = styled.input<{ value: number }>`
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #3e3e42;
  outline: none;
  border-radius: 2px;
  transition: box-shadow 0.2s ease;

  /* Purple glow that intensifies with value */
  box-shadow: 0 0 ${(props) => props.value * 4}px hsl(271 76% 53% / ${(props) => props.value * 0.4});

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${(props) =>
      props.value === 0
        ? "#606060"
        : `hsl(271 76% ${53 + props.value * 5}%)`}; /* Lighter purple as value increases */
    cursor: pointer;
    transition: background 0.2s ease;
  }

  &::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${(props) =>
      props.value === 0 ? "#606060" : `hsl(271 76% ${53 + props.value * 5}%)`};
    cursor: pointer;
    border: none;
    transition: background 0.2s ease;
  }

  &:hover {
    box-shadow: 0 0 ${(props) => (props.value + 1) * 4}px
      hsl(271 76% 53% / ${(props) => (props.value + 1) * 0.4});
  }
`;

const ThinkingLevelText = styled.span<{ level: string }>`
  font-size: 10px;
  font-weight: 500;
  min-width: 45px;
  color: ${(props) =>
    props.level === "off"
      ? "#606060"
      : props.level === "low"
        ? "hsl(271 76% 65%)"
        : props.level === "medium"
          ? "hsl(271 76% 60%)"
          : "hsl(271 76% 55%)"};
  text-transform: uppercase;
  user-select: none;
`;

// Helper functions to map between slider value and ThinkingLevel
const THINKING_LEVELS: ThinkingLevel[] = ["off", "low", "medium", "high"];

const thinkingLevelToValue = (level: ThinkingLevel): number => {
  return THINKING_LEVELS.indexOf(level);
};

const valueToThinkingLevel = (value: number): ThinkingLevel => {
  return THINKING_LEVELS[value] || "off";
};

interface ThinkingSliderProps {
  workspaceId: string;
}

export const ThinkingSliderComponent: React.FC<ThinkingSliderProps> = ({ workspaceId }) => {
  const [thinkingLevel, setThinkingLevel] = usePersistedState<ThinkingLevel>(
    `thinkingLevel:${workspaceId}`,
    "off"
  );

  return (
    <ThinkingSliderContainer>
      <ThinkingLabel>Thinking:</ThinkingLabel>
      <ThinkingSlider
        type="range"
        min="0"
        max="3"
        step="1"
        value={thinkingLevelToValue(thinkingLevel)}
        onChange={(e) => setThinkingLevel(valueToThinkingLevel(parseInt(e.target.value)))}
      />
      <ThinkingLevelText level={thinkingLevel}>{thinkingLevel}</ThinkingLevelText>
    </ThinkingSliderContainer>
  );
};

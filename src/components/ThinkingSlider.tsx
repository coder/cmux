import React, { useId } from "react";
import styled from "@emotion/styled";
import type { ThinkingLevel } from "@/types/thinking";
import { useThinkingLevel } from "@/hooks/useThinkingLevel";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";

const ThinkingSliderContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 20px;
`;

const ThinkingLabel = styled.label`
  font-size: 10px;
  color: #606060;
  user-select: none;
`;

// Subtle consistent glow for active levels
const GLOW = {
  track: "0 0 6px 1px hsl(271 76% 53% / 0.3)",
  thumb: "0 0 4px 1px hsl(271 76% 53% / 0.3)",
};

const GLOW_INTENSITIES: Record<number, { track: string; thumb: string }> = {
  0: { track: "none", thumb: "none" },
  1: GLOW,
  2: GLOW,
  3: GLOW,
};

// Continuous function for text styling based on level (n: 0-3)
const getTextStyle = (n: number) => {
  if (n === 0) {
    return {
      color: "#606060",
      fontWeight: 400,
      textShadow: "none",
      fontSize: "10px",
    };
  }

  // Continuous interpolation for n = 1-3
  const hue = 271 + (n - 1) * 7; // 271 → 278 → 285
  const lightness = 65 - (n - 1) * 5; // 65 → 60 → 55
  const fontWeight = 400 + n * 100; // 500 → 600 → 700
  const shadowBlur = n * 4; // 4 → 8 → 12
  const shadowOpacity = 0.3 + n * 0.15; // 0.45 → 0.6 → 0.75

  return {
    color: `hsl(${hue} 76% ${lightness}%)`,
    fontWeight,
    textShadow: `0 0 ${shadowBlur}px hsl(${hue} 76% ${lightness}% / ${shadowOpacity})`,
    fontSize: "10px",
  };
};

const ThinkingSlider = styled.input<{ value: number }>`
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #3e3e42;
  outline: none;
  border-radius: 2px;
  transition: box-shadow 0.2s ease;

  /* Purple glow that intensifies with level */
  box-shadow: ${(props) => GLOW_INTENSITIES[props.value].track};

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
    transition:
      background 0.2s ease,
      box-shadow 0.2s ease;
    box-shadow: ${(props) => GLOW_INTENSITIES[props.value].thumb};
  }

  &::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${(props) =>
      props.value === 0 ? "#606060" : `hsl(271 76% ${53 + props.value * 5}%)`};
    cursor: pointer;
    border: none;
    transition:
      background 0.2s ease,
      box-shadow 0.2s ease;
    box-shadow: ${(props) => GLOW_INTENSITIES[props.value].thumb};
  }

  &:hover {
    box-shadow: ${(props) => {
      const nextValue = Math.min(props.value + 1, 3);
      return GLOW_INTENSITIES[nextValue].track;
    }};

    &::-webkit-slider-thumb {
      box-shadow: ${(props) => {
        const nextValue = Math.min(props.value + 1, 3);
        return GLOW_INTENSITIES[nextValue].thumb;
      }};
    }

    &::-moz-range-thumb {
      box-shadow: ${(props) => {
        const nextValue = Math.min(props.value + 1, 3);
        return GLOW_INTENSITIES[nextValue].thumb;
      }};
    }
  }
`;

const ThinkingLevelText = styled.span<{ value: number }>`
  min-width: 45px;
  text-transform: uppercase;
  user-select: none;
  transition: all 0.2s ease;
  ${(props) => {
    const style = getTextStyle(props.value);
    return `
      color: ${style.color};
      font-weight: ${style.fontWeight};
      text-shadow: ${style.textShadow};
      font-size: ${style.fontSize};
    `;
  }}
`;

// Helper functions to map between slider value and ThinkingLevel
const THINKING_LEVELS: ThinkingLevel[] = ["off", "low", "medium", "high"];

const thinkingLevelToValue = (level: ThinkingLevel): number => {
  return THINKING_LEVELS.indexOf(level);
};

const valueToThinkingLevel = (value: number): ThinkingLevel => {
  return THINKING_LEVELS[value] || "off";
};

export const ThinkingSliderComponent: React.FC = () => {
  const [thinkingLevel, setThinkingLevel] = useThinkingLevel();

  const value = thinkingLevelToValue(thinkingLevel);
  const sliderId = useId();

  return (
    <TooltipWrapper>
      <ThinkingSliderContainer>
        <ThinkingLabel htmlFor={sliderId}>Thinking:</ThinkingLabel>
        <ThinkingSlider
          type="range"
          min="0"
          max="3"
          step="1"
          value={value}
          onChange={(e) => setThinkingLevel(valueToThinkingLevel(parseInt(e.target.value)))}
          id={sliderId}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={3}
          aria-valuenow={value}
          aria-valuetext={thinkingLevel}
        />
        <ThinkingLevelText value={value} aria-live="polite">
          {thinkingLevel}
        </ThinkingLevelText>
      </ThinkingSliderContainer>
      <Tooltip>{formatKeybind(KEYBINDS.TOGGLE_THINKING)} to toggle</Tooltip>
    </TooltipWrapper>
  );
};

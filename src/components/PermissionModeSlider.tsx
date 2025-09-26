import React from "react";
import styled from "@emotion/styled";
import type { UIPermissionMode } from "../types/global";
import { PERMISSION_MODE_CONFIG } from "../constants/permissionModes";

const SliderContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px;
  background: var(--color-background-secondary);
  border-radius: 4px;
  position: relative;
  user-select: none;
`;

const SliderTrack = styled.div`
  display: flex;
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  overflow: hidden;
`;

const SliderOption = styled.div<{ isActive: boolean }>`
  padding: 3px 8px;
  font-size: 9px;
  font-weight: 500;
  color: ${(props) => (props.isActive ? "#ffffff" : "#808080")};
  cursor: pointer;
  position: relative;
  z-index: 2;
  transition: color 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.3px;

  &:hover {
    color: ${(props) => (props.isActive ? "#ffffff" : "#a0a0a0")};
  }

  &:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 8px;
    margin-bottom: 4px;
    background: rgba(0, 0, 0, 0.8);
    color: #ffffff;
    font-size: 10px;
    text-transform: none;
    letter-spacing: normal;
    white-space: nowrap;
    border-radius: 3px;
    pointer-events: none;
    z-index: 10;
  }
`;

const SliderHighlight = styled.div<{ position: number; mode: UIPermissionMode }>`
  position: absolute;
  top: 0;
  bottom: 0;
  width: calc(100% / 3);
  background: ${(props) => PERMISSION_MODE_CONFIG[props.mode].color};
  border-radius: 3px;
  transform: translateX(${(props) => props.position * 100}%);
  transition:
    transform 0.2s ease,
    background 0.2s ease;
  z-index: 1;
`;

interface PermissionModeSliderProps {
  value: UIPermissionMode;
  onChange: (mode: UIPermissionMode) => void;
  className?: string;
}

const modes: UIPermissionMode[] = ["plan", "edit", "yolo"] as const;

export const PermissionModeSlider: React.FC<PermissionModeSliderProps> = ({
  value,
  onChange,
  className,
}) => {
  const currentIndex = modes.indexOf(value);

  return (
    <SliderContainer className={className}>
      <SliderTrack>
        <SliderHighlight position={currentIndex} mode={value} />
        {modes.map((mode) => (
          <SliderOption
            key={mode}
            isActive={mode === value}
            onClick={() => {
              console.log("Slider clicked:", mode);
              onChange(mode);
            }}
            data-tooltip={PERMISSION_MODE_CONFIG[mode].description}
          >
            {mode}
          </SliderOption>
        ))}
      </SliderTrack>
    </SliderContainer>
  );
};

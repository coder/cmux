import React from "react";
import styled from "@emotion/styled";

const ToggleContainer = styled.div`
  display: flex;
  gap: 0;
  background: var(--color-toggle-bg);
  border-radius: 4px;
`;

const ToggleButton = styled.button<{ active: boolean }>`
  padding: 4px 8px;
  font-size: 11px;
  font-family: var(--font-primary);
  color: ${(props) =>
    props.active ? "var(--color-toggle-text-active)" : "var(--color-toggle-text)"};
  background: ${(props) => (props.active ? "var(--color-toggle-active)" : "transparent")};
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-weight: ${(props) => (props.active ? "500" : "400")};

  &:hover {
    color: ${(props) =>
      props.active ? "var(--color-toggle-text-active)" : "var(--color-toggle-text-hover)"};
    background: ${(props) =>
      props.active ? "var(--color-toggle-active)" : "var(--color-toggle-hover)"};
  }
`;

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

interface ToggleGroupProps<T extends string> {
  options: Array<ToggleOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

export function ToggleGroup<T extends string>({ options, value, onChange }: ToggleGroupProps<T>) {
  return (
    <ToggleContainer>
      {options.map((option) => (
        <ToggleButton
          key={option.value}
          active={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </ToggleButton>
      ))}
    </ToggleContainer>
  );
}

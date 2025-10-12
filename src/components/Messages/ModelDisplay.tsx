import React from "react";
import styled from "@emotion/styled";
import AnthropicIcon from "@/assets/icons/anthropic.svg?react";

const ModelContainer = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-secondary);
  font-weight: normal;
  text-transform: lowercase;
  font-size: 10px;
`;

const IconWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  width: 12px;
  height: 12px;
  
  svg {
    width: 100%;
    height: 100%;
    
    .st0 {
      fill: currentColor;
    }
  }
`;

interface ModelDisplayProps {
  modelString: string;
}

/**
 * Display a model name with its provider icon.
 * Supports format "provider:model-name" (e.g., "anthropic:claude-sonnet-4-5")
 */
export const ModelDisplay: React.FC<ModelDisplayProps> = ({ modelString }) => {
  const [provider, modelName] = modelString.includes(":")
    ? modelString.split(":", 2)
    : ["", modelString];

  const providerIcon = provider === "anthropic" ? <AnthropicIcon /> : null;

  return (
    <ModelContainer>
      {providerIcon && <IconWrapper>{providerIcon}</IconWrapper>}
      {modelName.toLowerCase()}
    </ModelContainer>
  );
};


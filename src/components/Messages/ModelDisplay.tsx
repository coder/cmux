import React from "react";
import styled from "@emotion/styled";
import AnthropicIcon from "@/assets/icons/anthropic.svg?react";
import OpenAIIcon from "@/assets/icons/openai.svg?react";
import { TooltipWrapper, Tooltip } from "@/components/Tooltip";
import { formatModelDisplayName } from "@/utils/ai/modelDisplay";

const ModelContainer = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #cccccc; /* Match MessageHeader color */
  font-weight: 500; /* Match MessageHeader weight */
  font-size: 11px; /* Match MessageHeader size */
  text-transform: none; /* Override parent's uppercase */
  vertical-align: middle; /* Align with timestamp baseline */
`;

const IconWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  width: 14px;
  height: 14px;
  
  svg {
    width: 100%;
    height: 100%;
    
    /* Anthropic icon uses .st0 class */
    .st0 {
      fill: currentColor;
    }
    
    /* Generic SVGs with fill attribute */
    path[fill], circle[fill], rect[fill] {
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

  // Map provider names to their icons
  const getProviderIcon = () => {
    switch (provider) {
      case "anthropic":
        return <AnthropicIcon />;
      case "openai":
        return <OpenAIIcon />;
      default:
        return null;
    }
  };

  const providerIcon = getProviderIcon();
  const displayName = formatModelDisplayName(modelName);

  return (
    <TooltipWrapper inline>
      <ModelContainer>
        {providerIcon && <IconWrapper>{providerIcon}</IconWrapper>}
        {displayName}
      </ModelContainer>
      <Tooltip align="center">{modelString}</Tooltip>
    </TooltipWrapper>
  );
};


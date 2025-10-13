import React from "react";
import styled from "@emotion/styled";
import AnthropicIcon from "@/assets/icons/anthropic.svg?react";
import OpenAIIcon from "@/assets/icons/openai.svg?react";
import { TooltipWrapper, Tooltip } from "@/components/Tooltip";
import { formatModelDisplayName } from "@/utils/ai/modelDisplay";

const ModelContainer = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3em; /* Scales with font size */
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
  text-transform: none; /* Override parent's uppercase */
`;

const IconWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  width: 1em; /* Match font size exactly */
  height: 1em;

  svg {
    width: 100%;
    height: 100%;

    /* Anthropic icon uses .st0 class */
    .st0 {
      fill: currentColor;
    }

    /* Generic SVG elements - override any fill attributes */
    path,
    circle,
    rect {
      fill: currentColor !important;
    }
  }
`;

interface ModelDisplayProps {
  modelString: string;
  /** Whether to show the tooltip on hover (default: true, set to false when used within another tooltip) */
  showTooltip?: boolean;
}

/**
 * Display a model name with its provider icon.
 * Supports format "provider:model-name" (e.g., "anthropic:claude-sonnet-4-5")
 * 
 * Inherits font-size, color, and font-weight from parent context.
 * Icon and spacing scale proportionally using em units (1em icon, 0.3em gap).
 */
export const ModelDisplay: React.FC<ModelDisplayProps> = ({
  modelString,
  showTooltip = true,
}) => {
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

  const content = (
    <ModelContainer>
      {providerIcon && <IconWrapper>{providerIcon}</IconWrapper>}
      {displayName}
    </ModelContainer>
  );

  if (!showTooltip) {
    return content;
  }

  return (
    <TooltipWrapper inline>
      {content}
      <Tooltip align="center">{modelString}</Tooltip>
    </TooltipWrapper>
  );
};

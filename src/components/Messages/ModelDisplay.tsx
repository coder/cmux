import React from "react";
import styled from "@emotion/styled";
import AnthropicIcon from "@/assets/icons/anthropic.svg?react";
import OpenAIIcon from "@/assets/icons/openai.svg?react";
import { TooltipWrapper, Tooltip } from "@/components/Tooltip";
import { formatModelDisplayName } from "@/utils/ai/modelDisplay";

const ModelContainer = styled.span<{
  fontSize: number;
  gap: number;
}>`
  display: inline-flex;
  align-items: center;
  gap: ${(props) => props.gap}px;
  font-size: ${(props) => props.fontSize}px;
  font-weight: inherit;
  color: inherit;
  text-transform: none; /* Override parent's uppercase */
  vertical-align: middle; /* Align with timestamp baseline */
`;

const IconWrapper = styled.span<{ size: number }>`
  display: inline-flex;
  align-items: center;
  width: ${(props) => props.size}px;
  height: ${(props) => props.size}px;

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
  /** Font size in pixels (default: 11 for message headers, use smaller like 10 for tooltips) */
  fontSize?: number;
  /** Icon size in pixels (default: 14 for message headers, use smaller like 12 for tooltips) */
  iconSize?: number;
  /** Gap between icon and text in pixels (default: 6 for message headers, use smaller like 4 for tooltips) */
  gap?: number;
}

/**
 * Display a model name with its provider icon.
 * Supports format "provider:model-name" (e.g., "anthropic:claude-sonnet-4-5")
 */
export const ModelDisplay: React.FC<ModelDisplayProps> = ({
  modelString,
  fontSize = 11,
  iconSize = 14,
  gap = 6,
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

  return (
    <TooltipWrapper inline>
      <ModelContainer fontSize={fontSize} gap={gap}>
        {providerIcon && <IconWrapper size={iconSize}>{providerIcon}</IconWrapper>}
        {displayName}
      </ModelContainer>
      <Tooltip align="center">{modelString}</Tooltip>
    </TooltipWrapper>
  );
};

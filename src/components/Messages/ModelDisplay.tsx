import React from "react";
import styled from "@emotion/styled";
import AnthropicIcon from "@/assets/icons/anthropic.svg?react";
import OpenAIIcon from "@/assets/icons/openai.svg?react";
import { TooltipWrapper, Tooltip } from "@/components/Tooltip";
import { formatModelDisplayName } from "@/utils/ai/modelDisplay";

const ModelContainer = styled.span`
  display: inline-block; /* Changed from inline to support text overflow */
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
  text-transform: none; /* Override parent's uppercase */
  max-width: 100%; /* Allow container to constrain */
  overflow: hidden; /* Hide overflow */
  text-overflow: ellipsis; /* Show ellipsis */
  white-space: nowrap; /* Prevent wrapping */
  direction: rtl; /* Right-to-left to show end of text */
  text-align: left; /* Keep visual alignment left */
`;

const IconWrapper = styled.span`
  display: inline-block;
  vertical-align: -0.19em; /* Align icon slightly above baseline for visual centering */
  width: 1.1em; /* Slightly larger than text for visibility */
  height: 1.1em;
  margin-left: 0.3em; /* Gap after icon (reversed for RTL) */
  direction: ltr; /* Keep icon in LTR to prevent flipping */

  svg {
    display: block; /* Remove inline spacing */
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
 * Uses standard inline layout for natural text alignment.
 * Icon is 1em (matches font size) with vertical-align: middle.
 */
export const ModelDisplay: React.FC<ModelDisplayProps> = ({ modelString, showTooltip = true }) => {
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
    <ModelContainer data-model-display>
      {providerIcon && <IconWrapper data-model-icon>{providerIcon}</IconWrapper>}
      {displayName}
    </ModelContainer>
  );

  if (!showTooltip) {
    return content;
  }

  return (
    <TooltipWrapper inline data-model-display-tooltip>
      {content}
      <Tooltip align="center" data-model-tooltip-text>
        {modelString}
      </Tooltip>
    </TooltipWrapper>
  );
};

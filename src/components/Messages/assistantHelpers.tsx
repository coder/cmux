import React from "react";
import styled from "@emotion/styled";

// Styled component for the model label with lighter grey color
export const ModelLabel = styled.span`
  color: var(--color-text-secondary);
  font-weight: normal;
  text-transform: lowercase;
`;

// Format the assistant label with optional model
export function formatAssistantLabel(model?: string): React.ReactNode {
  if (!model) {
    return "ASSISTANT";
  }

  return (
    <>
      ASSISTANT <ModelLabel>{model.toLowerCase()}</ModelLabel>
    </>
  );
}

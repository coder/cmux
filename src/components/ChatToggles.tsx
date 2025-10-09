import React from "react";
import styled from "@emotion/styled";
import { ThinkingSliderComponent } from "./ThinkingSlider";
import { Context1MCheckbox } from "./Context1MCheckbox";

export const TogglesContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

interface ChatTogglesProps {
  workspaceId: string;
  modelString: string;
  children: React.ReactNode;
}

export const ChatToggles: React.FC<ChatTogglesProps> = ({ workspaceId, modelString, children }) => {
  return (
    <TogglesContainer>
      {children}
      <ThinkingSliderComponent />
      <Context1MCheckbox workspaceId={workspaceId} modelString={modelString} />
    </TogglesContainer>
  );
};

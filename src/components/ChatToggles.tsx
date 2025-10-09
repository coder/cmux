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
  modelString: string;
  children: React.ReactNode;
}

export const ChatToggles: React.FC<ChatTogglesProps> = ({ modelString, children }) => {
  return (
    <TogglesContainer>
      {children}
      <ThinkingSliderComponent />
      <Context1MCheckbox modelString={modelString} />
    </TogglesContainer>
  );
};

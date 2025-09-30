import React from "react";
import styled from "@emotion/styled";

const PlaceholderContainer = styled.div`
  color: #888888;
  font-family: var(--font-primary);
  font-size: 13px;
  line-height: 1.6;
`;

const PlaceholderTitle = styled.h3`
  color: #cccccc;
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 10px 0;
`;

export const ContextTab: React.FC = () => {
  return (
    <PlaceholderContainer>
      <PlaceholderTitle>Context</PlaceholderTitle>
      <p>Context information will be displayed here.</p>
    </PlaceholderContainer>
  );
};

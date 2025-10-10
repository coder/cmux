import React from "react";
import styled from "@emotion/styled";
import { VERSION } from "@/version";

const TitleBarContainer = styled.div`
  padding: 8px 16px;
  background: #1e1e1e;
  border-bottom: 1px solid #3c3c3c;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-primary);
  font-size: 11px;
  color: #858585;
  user-select: none;
  flex-shrink: 0;
`;

const TitleText = styled.div`
  font-weight: 600;
  letter-spacing: 0.5px;
`;

const BuildInfo = styled.div`
  font-size: 10px;
  opacity: 0.7;
`;

export function TitleBar() {
  // Format build date as YYYY-MM-DD
  const buildDate = VERSION.buildTime.split("T")[0];

  return (
    <TitleBarContainer>
      <TitleText>cmux {VERSION.git}</TitleText>
      <BuildInfo>{buildDate}</BuildInfo>
    </TitleBarContainer>
  );
}

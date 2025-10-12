import React from "react";
import styled from "@emotion/styled";
import { VERSION } from "@/version";
import { TooltipWrapper, Tooltip } from "./Tooltip";

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
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: normal;
  letter-spacing: 0.5px;
`;

const CmuxLink = styled.a`
  color: inherit;
  text-decoration: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const VersionText = styled.span`
  user-select: text;
  cursor: text;
`;

const BuildInfo = styled.div`
  font-size: 10px;
  opacity: 0.7;
  cursor: default;
`;

function formatUSDate(isoDate: string): string {
  const date = new Date(isoDate);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

function formatExtendedTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

export function TitleBar() {
  const buildDate = formatUSDate(VERSION.buildTime);
  const extendedTimestamp = formatExtendedTimestamp(VERSION.buildTime);

  return (
    <TitleBarContainer>
      <TitleText>
        <TooltipWrapper inline>
          <CmuxLink href="https://cmux.io" target="_blank" rel="noopener noreferrer">
            cmux
          </CmuxLink>
          <Tooltip align="left">Documentation (cmux.io)</Tooltip>
        </TooltipWrapper>
        <VersionText>{VERSION.git_describe}</VersionText>
      </TitleText>
      <TooltipWrapper>
        <BuildInfo>{buildDate}</BuildInfo>
        <Tooltip align="right">Built at {extendedTimestamp}</Tooltip>
      </TooltipWrapper>
    </TitleBarContainer>
  );
}

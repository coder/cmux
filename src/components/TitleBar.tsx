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
  font-weight: normal;
  letter-spacing: 0.5px;
  user-select: text;
  cursor: text;
`;

const BuildInfo = styled.div`
  font-size: 10px;
  opacity: 0.7;
  cursor: default;
`;

interface VersionMetadata {
  buildTime: string;
  git_describe?: unknown;
}

function hasBuildInfo(value: unknown): value is VersionMetadata {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.buildTime === "string";
}

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

function parseBuildInfo(version: unknown) {
  if (hasBuildInfo(version)) {
    const { buildTime, git_describe } = version;
    const gitDescribe = typeof git_describe === "string" ? git_describe : undefined;

    return {
      buildDate: formatUSDate(buildTime),
      extendedTimestamp: formatExtendedTimestamp(buildTime),
      gitDescribe,
    };
  }

  return {
    buildDate: "unknown",
    extendedTimestamp: "Unknown build time",
    gitDescribe: undefined,
  };
}

export function TitleBar() {
  const { buildDate, extendedTimestamp, gitDescribe } = parseBuildInfo(VERSION satisfies unknown);

  return (
    <TitleBarContainer>
      <TitleText>cmux {gitDescribe ?? "(dev)"}</TitleText>
      <TooltipWrapper>
        <BuildInfo>{buildDate}</BuildInfo>
        <Tooltip align="right">Built at {extendedTimestamp}</Tooltip>
      </TooltipWrapper>
    </TitleBarContainer>
  );
}

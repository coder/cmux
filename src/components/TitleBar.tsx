import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { VERSION } from "@/version";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import type { UpdateStatus } from "@/types/ipc";

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

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TitleText = styled.div`
  font-weight: normal;
  letter-spacing: 0.5px;
  user-select: text;
  cursor: text;
`;

const UpdateIndicator = styled.div<{ status: "available" | "downloading" | "downloaded" }>`
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: ${(props) => {
    switch (props.status) {
      case "available":
        return "#4CAF50"; // Green for available
      case "downloading":
        return "#2196F3"; // Blue for downloading
      case "downloaded":
        return "#FF9800"; // Orange for ready to install
    }
  }};

  &:hover {
    opacity: 0.7;
  }
`;

const UpdateIcon = styled.span`
  font-size: 14px;
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
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ type: "not-available" });

  useEffect(() => {
    // Subscribe to update status changes
    const unsubscribe = window.api.update.onStatus((status) => {
      setUpdateStatus(status);
    });

    // Get initial status
    window.api.update.getStatus().then(setUpdateStatus).catch(console.error);

    return unsubscribe;
  }, []);

  const handleUpdateClick = () => {
    if (updateStatus.type === "available") {
      window.api.update.download().catch(console.error);
    } else if (updateStatus.type === "downloaded") {
      window.api.update.install();
    }
  };

  const getUpdateTooltip = () => {
    switch (updateStatus.type) {
      case "available":
        return `Update available: ${updateStatus.info.version}. Click to download.`;
      case "downloading":
        return `Downloading update: ${updateStatus.percent}%`;
      case "downloaded":
        return `Update ready: ${updateStatus.info.version}. Click to install and restart.`;
      default:
        return "";
    }
  };

  const showUpdateIndicator =
    updateStatus.type === "available" ||
    updateStatus.type === "downloading" ||
    updateStatus.type === "downloaded";

  return (
    <TitleBarContainer>
      <LeftSection>
        {showUpdateIndicator && (
          <TooltipWrapper>
            <UpdateIndicator status={updateStatus.type} onClick={handleUpdateClick}>
              <UpdateIcon>{updateStatus.type === "downloading" ? "⟳" : "↓"}</UpdateIcon>
            </UpdateIndicator>
            <Tooltip align="left">{getUpdateTooltip()}</Tooltip>
          </TooltipWrapper>
        )}
        <TitleText>cmux {gitDescribe ?? "(dev)"}</TitleText>
      </LeftSection>
      <TooltipWrapper>
        <BuildInfo>{buildDate}</BuildInfo>
        <Tooltip align="right">Built at {extendedTimestamp}</Tooltip>
      </TooltipWrapper>
    </TitleBarContainer>
  );
}

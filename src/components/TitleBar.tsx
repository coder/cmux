import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { VERSION } from "@/version";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import type { UpdateStatus } from "@/types/ipc";
import { isTelemetryEnabled } from "@/telemetry";

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
  min-width: 0; /* Allow flex items to shrink */
  margin-right: 16px; /* Ensure space between title and date */
`;

const TitleText = styled.div`
  font-weight: normal;
  letter-spacing: 0.5px;
  user-select: text;
  cursor: text;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0; /* Allow ellipsis to work in flex container */
`;

const UpdateIndicator = styled.div<{
  status: "available" | "downloading" | "downloaded" | "disabled";
}>`
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ${(props) => (props.status === "disabled" ? "default" : "pointer")};
  color: ${(props) => {
    switch (props.status) {
      case "available":
        return "#4CAF50"; // Green for available
      case "downloading":
        return "#2196F3"; // Blue for downloading
      case "downloaded":
        return "#FF9800"; // Orange for ready to install
      case "disabled":
        return "#666666"; // Gray for disabled
    }
  }};

  &:hover {
    opacity: ${(props) => (props.status === "disabled" ? "1" : "0.7")};
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
  const [isCheckingOnHover, setIsCheckingOnHover] = useState(false);
  const lastHoverCheckTime = useRef<number>(0);
  const telemetryEnabled = isTelemetryEnabled();

  useEffect(() => {
    // Skip update checks if telemetry is disabled
    if (!telemetryEnabled) {
      return;
    }

    // Subscribe to update status changes (will receive current status immediately)
    const unsubscribe = window.api.update.onStatus((status) => {
      setUpdateStatus(status);
      setIsCheckingOnHover(false); // Clear checking state when status updates
    });

    // Check for updates on mount
    window.api.update.check().catch(console.error);

    // Check periodically (every 4 hours)
    const checkInterval = setInterval(
      () => {
        window.api.update.check().catch(console.error);
      },
      4 * 60 * 60 * 1000
    );

    return () => {
      unsubscribe();
      clearInterval(checkInterval);
    };
  }, [telemetryEnabled]);

  const handleIndicatorHover = () => {
    if (!telemetryEnabled) return;

    // Debounce: Only check once per minute on hover
    const now = Date.now();
    const HOVER_CHECK_COOLDOWN = 60 * 1000; // 1 minute
    
    if (now - lastHoverCheckTime.current < HOVER_CHECK_COOLDOWN) {
      return; // Too soon since last hover check
    }

    // Only trigger check if not already checking and no update available/downloading/downloaded
    if (updateStatus.type === "not-available" && !isCheckingOnHover) {
      lastHoverCheckTime.current = now;
      setIsCheckingOnHover(true);
      window.api.update.check().catch((error) => {
        console.error("Update check failed:", error);
        setIsCheckingOnHover(false);
      });
    }
  };

  const handleUpdateClick = () => {
    if (!telemetryEnabled) return; // No-op if telemetry disabled

    if (updateStatus.type === "available") {
      window.api.update.download().catch(console.error);
    } else if (updateStatus.type === "downloaded") {
      window.api.update.install();
    }
  };

  const getUpdateTooltip = () => {
    const currentVersion = gitDescribe ?? "dev";
    const lines: React.ReactNode[] = [`Current: ${currentVersion}`];

    if (!telemetryEnabled) {
      lines.push(
        "Update checks disabled (telemetry is off)",
        "Enable telemetry to receive updates."
      );
    } else if (isCheckingOnHover || updateStatus.type === "checking") {
      lines.push("Checking for updates...");
    } else {
      switch (updateStatus.type) {
        case "available":
          lines.push(`Update available: ${updateStatus.info.version}`, "Click to download.");
          break;
        case "downloading":
          lines.push(`Downloading update: ${updateStatus.percent}%`);
          break;
        case "downloaded":
          lines.push(`Update ready: ${updateStatus.info.version}`, "Click to install and restart.");
          break;
        case "not-available":
          lines.push("No updates available", "Checks every 4 hours.");
          break;
        case "error":
          lines.push("Update check failed", updateStatus.message);
          break;
      }
    }

    // Always add releases link as defense-in-depth
    lines.push(
      <a
        href="https://github.com/coder/cmux/releases"
        target="_blank"
        rel="noopener noreferrer"
      >
        View all releases
      </a>
    );

    return (
      <>
        {lines.map((line, i) => (
          <React.Fragment key={i}>
            {i > 0 && <br />}
            {line}
          </React.Fragment>
        ))}
      </>
    );
  };

  const getIndicatorStatus = (): "available" | "downloading" | "downloaded" | "disabled" => {
    if (!telemetryEnabled) return "disabled";

    if (isCheckingOnHover || updateStatus.type === "checking") return "disabled";

    switch (updateStatus.type) {
      case "available":
        return "available";
      case "downloading":
        return "downloading";
      case "downloaded":
        return "downloaded";
      default:
        return "disabled";
    }
  };

  const indicatorStatus = getIndicatorStatus();
  // Always show indicator in packaged builds (or dev with DEBUG_UPDATER)
  // In dev without DEBUG_UPDATER, the backend won't initialize updater service
  const showUpdateIndicator = true;

  return (
    <TitleBarContainer>
      <LeftSection>
        {showUpdateIndicator && (
          <TooltipWrapper>
            <UpdateIndicator
              status={indicatorStatus}
              onClick={handleUpdateClick}
              onMouseEnter={handleIndicatorHover}
            >
              <UpdateIcon>
                {indicatorStatus === "disabled"
                  ? "⊘"
                  : indicatorStatus === "downloading"
                    ? "⟳"
                    : "↓"}
              </UpdateIcon>
            </UpdateIndicator>
            <Tooltip align="left" interactive={true}>{getUpdateTooltip()}</Tooltip>
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

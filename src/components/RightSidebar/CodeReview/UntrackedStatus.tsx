/**
 * UntrackedStatus - Shows untracked files count with interactive tooltip
 */

import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";

interface UntrackedStatusProps {
  workspaceId: string;
  workspacePath: string;
  refreshTrigger?: number;
}

const Container = styled.div`
  position: relative;
  display: inline-block;
`;

const Badge = styled.div<{ hasUntracked: boolean }>`
  padding: 4px 10px;
  border-radius: 3px;
  font-weight: 500;
  font-size: 11px;
  background: ${(props) => (props.hasUntracked ? "#3e2a00" : "transparent")};
  border: 1px solid ${(props) => (props.hasUntracked ? "#806000" : "transparent")};
  color: ${(props) => (props.hasUntracked ? "#ffb347" : "#888")};
  white-space: nowrap;
  cursor: ${(props) => (props.hasUntracked ? "pointer" : "default")};
  transition: all 0.2s ease;

  &:hover {
    ${(props) =>
      props.hasUntracked &&
      `
      background: #4a3200;
      border-color: #a07000;
    `}
  }
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const Tooltip = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 4px;
  padding: 8px;
  min-width: 200px;
  max-width: 400px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  animation: ${fadeIn} 0.15s ease;
`;

const TooltipHeader = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: #ccc;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #3e3e42;
`;

const FileList = styled.div`
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 8px;
`;

const FileItem = styled.div`
  font-size: 11px;
  color: #aaa;
  padding: 3px 4px;
  font-family: var(--font-monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    background: #37373d;
  }
`;

const TrackButton = styled.button`
  width: 100%;
  padding: 4px 8px;
  background: transparent;
  color: #888;
  border: 1px solid #444;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ccc;
    border-color: #666;
  }

  &:active {
    background: rgba(255, 255, 255, 0.1);
  }

  &:disabled {
    color: #555;
    border-color: #333;
    cursor: not-allowed;
    background: transparent;
  }
`;

export const UntrackedStatus: React.FC<UntrackedStatusProps> = ({
  workspaceId,
  workspacePath,
  refreshTrigger,
}) => {
  const [untrackedFiles, setUntrackedFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load untracked files
  useEffect(() => {
    let cancelled = false;

    const loadUntracked = async () => {
      setIsLoading(true);
      try {
        const result = await window.api.workspace.executeBash(
          workspaceId,
          "git ls-files --others --exclude-standard",
          { timeout_secs: 5 }
        );

        if (cancelled) return;

        if (result.success) {
          const files = (result.data.output ?? "")
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean);
          setUntrackedFiles(files);
        }
      } catch (err) {
        console.error("Failed to load untracked files:", err);
      } finally {
        setIsLoading(false);
      }
    };

    void loadUntracked();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, workspacePath, refreshTrigger]);

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!showTooltip) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  const handleTrackAll = async () => {
    if (untrackedFiles.length === 0 || isTracking) return;

    setIsTracking(true);
    try {
      // Use git add to stage all untracked files
      const result = await window.api.workspace.executeBash(
        workspaceId,
        `git add ${untrackedFiles.map((f) => `"${f}"`).join(" ")}`,
        { timeout_secs: 10 }
      );

      if (result.success) {
        setUntrackedFiles([]);
        setShowTooltip(false);
      } else {
        console.error("Failed to track files:", result.error);
      }
    } catch (err) {
      console.error("Failed to track files:", err);
    } finally {
      setIsTracking(false);
    }
  };

  const count = untrackedFiles.length;
  const hasUntracked = count > 0;

  return (
    <Container ref={containerRef}>
      <Badge
        hasUntracked={hasUntracked}
        onClick={() => hasUntracked && setShowTooltip(!showTooltip)}
        title={hasUntracked ? "Click to see untracked files" : undefined}
      >
        {isLoading ? "..." : `${count} Untracked`}
      </Badge>

      {showTooltip && hasUntracked && (
        <Tooltip>
          <TooltipHeader>Untracked Files ({count})</TooltipHeader>
          <FileList>
            {untrackedFiles.map((file) => (
              <FileItem key={file}>{file}</FileItem>
            ))}
          </FileList>
          <TrackButton onClick={() => void handleTrackAll()} disabled={isTracking}>
            {isTracking ? "Tracking..." : "Track All"}
          </TrackButton>
        </Tooltip>
      )}
    </Container>
  );
};


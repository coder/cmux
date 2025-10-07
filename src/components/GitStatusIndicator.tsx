import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import type { GitStatus } from "@/types/workspace";
import { parseGitShowBranch, type GitCommit, type GitBranchHeader } from "@/utils/git/parseGitLog";

const Container = styled.span`
  color: #569cd6;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 6px;
  font-family: var(--font-monospace);
  position: relative;
`;

const Arrow = styled.span`
  display: flex;
  align-items: center;
  font-weight: normal;
`;

const DirtyIndicator = styled.span`
  display: flex;
  align-items: center;
  font-weight: normal;
  color: var(--color-git-dirty);
  line-height: 1;
`;

const Tooltip = styled.div<{ show: boolean }>`
  position: fixed;
  z-index: 10000;
  background: #2d2d30;
  color: #cccccc;
  border: 1px solid #464647;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 11px;
  font-family: var(--font-monospace);
  white-space: pre;
  max-width: 600px;
  max-height: 400px;
  overflow: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  opacity: ${(props) => (props.show ? 1 : 0)};
  visibility: ${(props) => (props.show ? "visible" : "hidden")};
  transition:
    opacity 0.2s,
    visibility 0.2s;

  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #424242;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #4e4e4e;
  }
`;

const BranchHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #464647;
`;

const BranchHeaderLine = styled.div`
  display: flex;
  gap: 8px;
  font-family: var(--font-monospace);
  line-height: 1.4;
`;

const BranchName = styled.span`
  color: #cccccc;
`;

const DirtySection = styled.div`
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #464647;
`;

const DirtySectionTitle = styled.div`
  color: var(--color-git-dirty);
  font-weight: 600;
  margin-bottom: 4px;
  font-family: var(--font-monospace);
`;

const DirtyFileList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const DirtyFileLine = styled.div`
  color: #cccccc;
  font-family: var(--font-monospace);
  font-size: 11px;
  line-height: 1.4;
  white-space: pre;
`;

const TruncationNote = styled.div`
  color: #808080;
  font-style: italic;
  margin-top: 4px;
  font-size: 10px;
`;

const CommitList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const CommitLine = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CommitMainLine = styled.div`
  display: flex;
  gap: 8px;
  font-family: var(--font-monospace);
  line-height: 1.4;
`;

const CommitIndicators = styled.span`
  color: #6b6b6b;
  white-space: pre;
  flex-shrink: 0;
  font-family: var(--font-monospace);
  margin-right: 8px;
`;

const IndicatorChar = styled.span<{ branch: number }>`
  color: ${(props) => {
    switch (props.branch) {
      case 0:
        return "#6bcc6b"; // Green for HEAD
      case 1:
        return "#6ba3cc"; // Blue for origin/main
      case 2:
        return "#b66bcc"; // Purple for origin/branch
      default:
        return "#6b6b6b"; // Gray fallback
    }
  }};
`;

const CommitHash = styled.span`
  color: #569cd6;
  flex-shrink: 0;
  user-select: all;
`;

const CommitDate = styled.span`
  color: #808080;
  flex-shrink: 0;
`;

const CommitSubject = styled.span`
  color: #cccccc;
  flex: 1;
  word-break: break-word;
`;

interface GitStatusIndicatorProps {
  gitStatus: GitStatus | null;
  workspaceId: string;
  tooltipPosition?: "right" | "bottom";
}

/**
 * Displays git status (ahead/behind) relative to origin's primary branch.
 * Shows arrows with counts: ↑N for ahead, ↓M for behind.
 * Shows * indicator if there are uncommitted changes (dirty).
 * Shows nothing if status is unavailable and no changes.
 * On hover, displays git show-branch output in a tooltip.
 */
export const GitStatusIndicator: React.FC<GitStatusIndicatorProps> = ({
  gitStatus,
  workspaceId,
  tooltipPosition = "right",
}) => {
  // All hooks must be called before any conditional returns
  const [showTooltip, setShowTooltip] = useState(false);
  const [branchHeaders, setBranchHeaders] = useState<GitBranchHeader[] | null>(null);
  const [commits, setCommits] = useState<GitCommit[] | null>(null);
  const [dirtyFiles, setDirtyFiles] = useState<string[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tooltipCoords, setTooltipCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cacheRef = useRef<{
    headers: GitBranchHeader[];
    commits: GitCommit[];
    dirtyFiles: string[];
    timestamp: number;
  } | null>(null);
  const containerRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    // Cancel any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    setShowTooltip(true);

    // Calculate tooltip position based on indicator position
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();

      if (tooltipPosition === "right") {
        // Position to the right of the indicator
        setTooltipCoords({
          top: rect.top + rect.height / 2,
          left: rect.right + 8,
        });
      } else {
        // Position below the indicator
        setTooltipCoords({
          top: rect.bottom + 8,
          left: rect.left,
        });
      }
    }

    // Check cache (5 second TTL)
    const now = Date.now();
    if (cacheRef.current && now - cacheRef.current.timestamp < 5000) {
      setBranchHeaders(cacheRef.current.headers);
      setCommits(cacheRef.current.commits);
      setDirtyFiles(cacheRef.current.dirtyFiles);
      setErrorMessage(null);
      return;
    }

    // Set loading state immediately so tooltip shows "Loading..." instead of "No commits to display"
    setIsLoading(true);

    // Debounce the fetch by 200ms to avoid rapid re-fetches
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    fetchTimeoutRef.current = setTimeout(() => {
      void fetchShowBranch();
    }, 200);
  };

  const handleMouseLeave = () => {
    // Delay hiding to give user time to move cursor to tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 300);

    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseEnter = () => {
    // Cancel hide timeout when hovering tooltip
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
    // Hide immediately when leaving tooltip
    setShowTooltip(false);
  };

  const fetchShowBranch = async () => {
    setIsLoading(true);

    try {
      // Get current branch name
      const currentBranchResult = await window.api.workspace.executeBash(
        workspaceId,
        "git rev-parse --abbrev-ref HEAD",
        { timeout_secs: 2 }
      );

      let currentBranch = "main"; // fallback
      if (currentBranchResult.success && currentBranchResult.data.success) {
        currentBranch = currentBranchResult.data.output.trim() || "main";
      }

      // Get primary branch - reuse the same logic as useGitStatus
      const branchCheckResult = await window.api.workspace.executeBash(
        workspaceId,
        "git branch -r | grep -E 'origin/(main|master)$' | head -1 | sed 's@^.*origin/@@'",
        { timeout_secs: 2 }
      );

      let primaryBranch = "main"; // fallback
      if (branchCheckResult.success && branchCheckResult.data.success) {
        primaryBranch = branchCheckResult.data.output.trim() || "main";
      }

      // Use git show-branch to get branch indicators (without --more to avoid extraneous commits)
      const showBranchResult = await window.api.workspace.executeBash(
        workspaceId,
        `git show-branch --sha1-name HEAD origin/${primaryBranch} origin/${currentBranch}`,
        { timeout_secs: 3, max_lines: 50 }
      );

      if (!showBranchResult.success || !showBranchResult.data.success) {
        setErrorMessage("Branch info unavailable");
        setCommits(null);
        return;
      }

      const showBranchOutput = showBranchResult.data.output.trim();
      if (!showBranchOutput) {
        setErrorMessage("No branch info available");
        setCommits(null);
        return;
      }

      // Extract hashes from show-branch output to fetch dates
      const hashMatch = showBranchOutput.matchAll(/\[([a-f0-9]+)\]/g);
      const hashes = Array.from(hashMatch, (m) => m[1]);

      if (hashes.length === 0) {
        setErrorMessage("No commits found");
        setCommits(null);
        return;
      }

      // Fetch dates for all hashes in a single batch call
      const dateResult = await window.api.workspace.executeBash(
        workspaceId,
        `git log --format='%h|%ad' --date=format:'%b %d %I:%M %p' ${hashes.join(" ")}`,
        { timeout_secs: 2, max_lines: 50 }
      );

      // Build hash -> date map
      const dateMap = new Map<string, string>();
      if (dateResult.success && dateResult.data.success) {
        const dateLines = dateResult.data.output.trim().split("\n");
        for (const line of dateLines) {
          const [hash, date] = line.split("|");
          if (hash && date) {
            dateMap.set(hash.trim(), date.trim());
          }
        }
      }

      // Parse show-branch output with dates
      const parsed = parseGitShowBranch(showBranchOutput, dateMap);
      if (parsed.commits.length === 0) {
        setErrorMessage("Unable to parse branch info");
        setBranchHeaders(null);
        setCommits(null);
        setDirtyFiles(null);
        return;
      }

      // Fetch git status --porcelain for dirty files
      let parsedDirtyFiles: string[] = [];
      if (gitStatus?.dirty) {
        const statusResult = await window.api.workspace.executeBash(
          workspaceId,
          "git status --porcelain",
          { timeout_secs: 2, max_lines: 25 }
        );

        if (statusResult.success && statusResult.data.success) {
          const lines = statusResult.data.output
            .trim()
            .split("\n")
            .filter((line) => line.trim());
          parsedDirtyFiles = lines;
        }
      }

      setBranchHeaders(parsed.headers);
      setCommits(parsed.commits);
      setDirtyFiles(parsedDirtyFiles);
      setErrorMessage(null);
      cacheRef.current = {
        headers: parsed.headers,
        commits: parsed.commits,
        dirtyFiles: parsedDirtyFiles,
        timestamp: Date.now(),
      };
    } catch {
      setErrorMessage("Failed to fetch branch info");
      setCommits(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Don't render if no status or no meaningful information to show (check AFTER all hooks)
  if (!gitStatus || (gitStatus.ahead === 0 && gitStatus.behind === 0 && !gitStatus.dirty)) {
    return null;
  }

  // Render colored indicator characters
  const renderIndicators = (indicators: string) => {
    return (
      <CommitIndicators>
        {Array.from(indicators).map((char, index) => (
          <IndicatorChar key={index} branch={index}>
            {char}
          </IndicatorChar>
        ))}
      </CommitIndicators>
    );
  };

  // Render branch header showing which column corresponds to which branch
  const renderBranchHeaders = () => {
    if (!branchHeaders || branchHeaders.length === 0) {
      return null;
    }

    return (
      <BranchHeader>
        {branchHeaders.map((header, index) => (
          <BranchHeaderLine key={index}>
            <CommitIndicators>
              {/* Create spacing to align with column */}
              {Array.from({ length: header.columnIndex }).map((_, i) => (
                <IndicatorChar key={i} branch={i}>
                  {" "}
                </IndicatorChar>
              ))}
              <IndicatorChar branch={header.columnIndex}>!</IndicatorChar>
            </CommitIndicators>
            <BranchName>[{header.branch}]</BranchName>
          </BranchHeaderLine>
        ))}
      </BranchHeader>
    );
  };

  // Render dirty files section
  const renderDirtySection = () => {
    if (!dirtyFiles || dirtyFiles.length === 0) {
      return null;
    }

    const LIMIT = 20;
    const displayFiles = dirtyFiles.slice(0, LIMIT);
    const isTruncated = dirtyFiles.length > LIMIT;

    return (
      <DirtySection>
        <DirtySectionTitle>Uncommitted changes:</DirtySectionTitle>
        <DirtyFileList>
          {displayFiles.map((line, index) => (
            <DirtyFileLine key={index}>{line}</DirtyFileLine>
          ))}
        </DirtyFileList>
        {isTruncated && (
          <TruncationNote>
            (showing {LIMIT} of {dirtyFiles.length} files)
          </TruncationNote>
        )}
      </DirtySection>
    );
  };

  // Render tooltip content
  const renderTooltipContent = () => {
    if (isLoading) {
      return "Loading...";
    }

    if (errorMessage) {
      return errorMessage;
    }

    if (!commits || commits.length === 0) {
      return "No commits to display";
    }

    return (
      <>
        {renderDirtySection()}
        {renderBranchHeaders()}
        <CommitList>
          {commits.map((commit, index) => (
            <CommitLine key={`${commit.hash}-${index}`}>
              <CommitMainLine>
                {renderIndicators(commit.indicators)}
                <CommitHash>{commit.hash}</CommitHash>
                <CommitDate>{commit.date}</CommitDate>
                <CommitSubject>{commit.subject}</CommitSubject>
              </CommitMainLine>
            </CommitLine>
          ))}
        </CommitList>
      </>
    );
  };

  // Render tooltip via portal to bypass overflow constraints
  const tooltipElement = (
    <Tooltip
      show={showTooltip}
      style={{
        top: `${tooltipCoords.top}px`,
        left: `${tooltipCoords.left}px`,
        transform: tooltipPosition === "right" ? "translateY(-50%)" : "none",
      }}
      onMouseEnter={handleTooltipMouseEnter}
      onMouseLeave={handleTooltipMouseLeave}
    >
      {renderTooltipContent()}
    </Tooltip>
  );

  return (
    <>
      <Container ref={containerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        {gitStatus.ahead > 0 && <Arrow>↑{gitStatus.ahead}</Arrow>}
        {gitStatus.behind > 0 && <Arrow>↓{gitStatus.behind}</Arrow>}
        {gitStatus.dirty && <DirtyIndicator>*</DirtyIndicator>}
      </Container>

      {createPortal(tooltipElement, document.body)}
    </>
  );
};

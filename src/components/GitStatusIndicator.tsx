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
      // Consolidated bash script that gets all git info in one IPC call
      const getDirtyFiles = gitStatus?.dirty ? "git status --porcelain 2>/dev/null | head -20" : "";
      const script = `
# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

# Get primary branch (main or master)
PRIMARY_BRANCH=$(git branch -r 2>/dev/null | grep -E 'origin/(main|master)$' | head -1 | sed 's@^.*origin/@@' || echo "main")

# Build refs list for show-branch
REFS="HEAD origin/$PRIMARY_BRANCH"

# Check if origin/<current-branch> exists and is different from primary
if [ "$CURRENT_BRANCH" != "$PRIMARY_BRANCH" ] && git rev-parse --verify "origin/$CURRENT_BRANCH" >/dev/null 2>&1; then
  REFS="$REFS origin/$CURRENT_BRANCH"
fi

# Store show-branch output to avoid running twice
SHOW_BRANCH=$(git show-branch --sha1-name $REFS)

# Output show-branch
echo "$SHOW_BRANCH"

# Separator for dates section
echo "---DATES---"

# Extract all hashes and get dates in ONE git log call
HASHES=$(echo "$SHOW_BRANCH" | grep -oE '\\[[a-f0-9]+\\]' | tr -d '[]' | tr '\\n' ' ')
git log --no-walk --format='%h|%ad' --date=format:'%b %d %I:%M %p' $HASHES 2>/dev/null

# Separator for dirty files section
echo "---DIRTY_FILES---"

# Get dirty files if requested
${getDirtyFiles}
`;

      const result = await window.api.workspace.executeBash(workspaceId, script, {
        timeout_secs: 5,
        niceness: 19, // Lowest priority - don't interfere with user operations
      });

      if (!result.success) {
        setErrorMessage(`Branch info unavailable: ${result.error}`);
        setCommits(null);
        return;
      }

      if (!result.data.success) {
        const errorMsg = result.data.output
          ? result.data.output.trim()
          : result.data.error || "Unknown error";
        setErrorMessage(`Branch info unavailable: ${errorMsg}`);
        setCommits(null);
        return;
      }

      // Parse the structured output
      const output = result.data.output;
      const sections = output.split("---DATES---");

      if (sections.length < 2) {
        setErrorMessage("Invalid output format from git script");
        setCommits(null);
        return;
      }

      const showBranchOutput = sections[0].trim();
      const afterDates = sections[1].split("---DIRTY_FILES---");
      const datesOutput = afterDates[0].trim();
      const dirtyOutput = afterDates.length > 1 ? afterDates[1].trim() : "";

      // Build date map
      const dateMap = new Map<string, string>();
      if (datesOutput) {
        const dateLines = datesOutput.split("\n");
        for (const line of dateLines) {
          const [hash, date] = line.split("|");
          if (hash && date) {
            dateMap.set(hash.trim(), date.trim());
          }
        }
      }

      // Parse show-branch output
      const parsed = parseGitShowBranch(showBranchOutput, dateMap);
      if (parsed.commits.length === 0) {
        setErrorMessage("Unable to parse branch info");
        setBranchHeaders(null);
        setCommits(null);
        setDirtyFiles(null);
        return;
      }

      // Parse dirty files
      const parsedDirtyFiles = dirtyOutput
        ? dirtyOutput.split("\n").filter((line) => line.trim())
        : [];

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
    } catch (error) {
      setErrorMessage(
        `Failed to fetch branch info: ${error instanceof Error ? error.message : String(error)}`
      );
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

  // Render empty placeholder to maintain grid layout (prevents layout shift)
  if (!gitStatus || (gitStatus.ahead === 0 && gitStatus.behind === 0 && !gitStatus.dirty)) {
    return <Container aria-hidden="true" />;
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

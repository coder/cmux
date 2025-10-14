import React from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import type { GitStatus } from "@/types/workspace";
import type { GitCommit, GitBranchHeader } from "@/utils/git/parseGitLog";

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

export interface GitStatusIndicatorViewProps {
  gitStatus: GitStatus | null;
  tooltipPosition?: "right" | "bottom";
  // Tooltip data
  branchHeaders: GitBranchHeader[] | null;
  commits: GitCommit[] | null;
  dirtyFiles: string[] | null;
  isLoading: boolean;
  errorMessage: string | null;
  // Interaction
  showTooltip: boolean;
  tooltipCoords: { top: number; left: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTooltipMouseEnter: () => void;
  onTooltipMouseLeave: () => void;
  onContainerRef: (el: HTMLSpanElement | null) => void;
}

/**
 * Pure presentation component for git status indicator.
 * Displays git status (ahead/behind/dirty) with tooltip on hover.
 * All data is passed as props - no IPC calls or side effects.
 */
export const GitStatusIndicatorView: React.FC<GitStatusIndicatorViewProps> = ({
  gitStatus,
  tooltipPosition = "right",
  branchHeaders,
  commits,
  dirtyFiles,
  isLoading,
  errorMessage,
  showTooltip,
  tooltipCoords,
  onMouseEnter,
  onMouseLeave,
  onTooltipMouseEnter,
  onTooltipMouseLeave,
  onContainerRef,
}) => {
  // Handle null gitStatus (loading state)
  if (!gitStatus) {
    return <Container aria-hidden="true" />;
  }

  // Render empty placeholder when nothing to show (prevents layout shift)
  if (gitStatus.ahead === 0 && gitStatus.behind === 0 && !gitStatus.dirty) {
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
      onMouseEnter={onTooltipMouseEnter}
      onMouseLeave={onTooltipMouseLeave}
    >
      {renderTooltipContent()}
    </Tooltip>
  );

  return (
    <>
      <Container ref={onContainerRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        {gitStatus.ahead > 0 && <Arrow>↑{gitStatus.ahead}</Arrow>}
        {gitStatus.behind > 0 && <Arrow>↓{gitStatus.behind}</Arrow>}
        {gitStatus.dirty && <DirtyIndicator>*</DirtyIndicator>}
      </Container>

      {createPortal(tooltipElement, document.body)}
    </>
  );
};

import React from "react";
import type { FileSearchToolArgs, FileSearchToolResult } from "@/types/tools";
import {
  ToolContainer,
  ToolHeader,
  ExpandIcon,
  StatusIndicator,
  ToolDetails,
  DetailSection,
  DetailLabel,
  DetailContent,
  LoadingDots,
} from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, type ToolStatus } from "./shared/toolUtils";
import { TooltipWrapper, Tooltip } from "../Tooltip";

interface FileSearchToolCallProps {
  args: FileSearchToolArgs;
  result?: FileSearchToolResult;
  status?: ToolStatus;
}

export const FileSearchToolCall: React.FC<FileSearchToolCallProps> = ({
  args,
  result,
  status = "pending",
}) => {
  const { expanded, toggleExpanded } = useToolExpansion();

  const matchCount = result?.success ? result.matches.length : 0;
  const totalMatches = result?.success ? result.total_matches : 0;
  const hasMore = matchCount < totalMatches;

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <TooltipWrapper inline>
          <span>🔍</span>
          <Tooltip>file_search</Tooltip>
        </TooltipWrapper>
        <span className="text-text font-monospace max-w-96 truncate">{args.file_path}</span>
        {result && result.success && (
          <span className="text-secondary ml-2 text-[10px] whitespace-nowrap">
            {matchCount} {matchCount === 1 ? "match" : "matches"}
            {hasMore && ` (showing first ${matchCount})`}
          </span>
        )}
        <StatusIndicator status={status}>{getStatusDisplay(status)}</StatusIndicator>
      </ToolHeader>

      {expanded && (
        <ToolDetails>
          <DetailSection>
            <div className="bg-code-bg flex flex-wrap gap-4 rounded px-2 py-1.5 text-[11px] leading-[1.4]">
              <div className="flex gap-1.5">
                <DetailLabel>Pattern:</DetailLabel>
                <DetailContent>
                  <code className="text-code-string">&quot;{args.pattern}&quot;</code>
                </DetailContent>
              </div>
              {args.context_lines !== undefined && (
                <div className="flex gap-1.5">
                  <DetailLabel>Context:</DetailLabel>
                  <DetailContent>{args.context_lines} lines</DetailContent>
                </div>
              )}
            </div>
          </DetailSection>

          {!result && (
            <DetailSection>
              <div className="text-secondary flex items-center gap-2">
                <span>Searching</span>
                <LoadingDots />
              </div>
            </DetailSection>
          )}

          {result && !result.success && (
            <DetailSection>
              <div className="border-error-border bg-error-bg rounded border px-3 py-2 text-sm">
                <span className="text-error font-medium">Error: </span>
                <span className="text-text">{result.error}</span>
              </div>
            </DetailSection>
          )}

          {result && result.success && (
            <>
              {matchCount === 0 ? (
                <DetailSection>
                  <div className="text-secondary text-sm">No matches found</div>
                </DetailSection>
              ) : (
                result.matches.map((match, idx) => (
                  <DetailSection key={`match-${match.line_number}-${idx}`}>
                    <div className="bg-code-bg rounded">
                      {/* Context before */}
                      {match.context_before.length > 0 && (
                        <div className="text-code-comment border-code-border border-b px-3 py-1 font-mono text-xs">
                          {match.context_before.map((line, i) => (
                            <div key={`before-${i}`} className="opacity-60">
                              <span className="text-code-line-number mr-3 inline-block w-8 text-right">
                                {match.line_number - match.context_before.length + i}
                              </span>
                              {line}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Matching line - highlighted */}
                      <div className="bg-code-highlight px-3 py-1 font-mono text-xs">
                        <span className="text-code-line-number mr-3 inline-block w-8 text-right font-bold">
                          {match.line_number}
                        </span>
                        <span className="text-code-keyword font-medium">{match.line_content}</span>
                      </div>

                      {/* Context after */}
                      {match.context_after.length > 0 && (
                        <div className="text-code-comment border-code-border border-t px-3 py-1 font-mono text-xs">
                          {match.context_after.map((line, i) => (
                            <div key={`after-${i}`} className="opacity-60">
                              <span className="text-code-line-number mr-3 inline-block w-8 text-right">
                                {match.line_number + i + 1}
                              </span>
                              {line}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </DetailSection>
                ))
              )}

              {hasMore && (
                <DetailSection>
                  <div className="text-secondary text-xs">
                    Showing first {matchCount} of {totalMatches} matches. Increase max_results to
                    see more.
                  </div>
                </DetailSection>
              )}
            </>
          )}
        </ToolDetails>
      )}
    </ToolContainer>
  );
};

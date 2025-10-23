import React from "react";
import type { FileReadToolArgs, FileReadToolResult } from "@/types/tools";
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

interface FileReadToolCallProps {
  args: FileReadToolArgs;
  result?: FileReadToolResult;
  status?: ToolStatus;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Parse file_read content which comes formatted as:
 * LINE_NUMBER\tCONTENT
 * LINE_NUMBER\tCONTENT
 * ...
 */
function parseFileContent(content: string): {
  lineNumbers: string[];
  actualContent: string;
  actualBytes: number;
} {
  const lines = content.split("\n");
  const lineNumbers: string[] = [];
  const contentLines: string[] = [];

  for (const line of lines) {
    const tabIndex = line.indexOf("\t");
    if (tabIndex !== -1) {
      // Line has format: NUMBER\tCONTENT
      lineNumbers.push(line.substring(0, tabIndex));
      contentLines.push(line.substring(tabIndex + 1));
    } else {
      // Malformed or empty line - preserve as-is
      lineNumbers.push("");
      contentLines.push(line);
    }
  }

  const actualContent = contentLines.join("\n");
  // Calculate actual bytes (content + newlines, without line number prefixes)
  const actualBytes = new TextEncoder().encode(actualContent).length;

  return { lineNumbers, actualContent, actualBytes };
}

export const FileReadToolCall: React.FC<FileReadToolCallProps> = ({
  args,
  result,
  status = "pending",
}) => {
  const { expanded, toggleExpanded } = useToolExpansion();

  // Use full file path for consistency with file_edit display
  const filePath = args.filePath;

  // Parse the file content to extract line numbers and actual content
  const parsedContent = result?.success && result.content ? parseFileContent(result.content) : null;

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <TooltipWrapper inline>
          <span>📖</span>
          <Tooltip>file_read</Tooltip>
        </TooltipWrapper>
        <span className="font-monospace max-w-96 truncate text-gray-200">{filePath}</span>
        {result && result.success && parsedContent && (
          <span className="ml-2 text-[10px] text-gray-600">
            read {formatBytes(parsedContent.actualBytes)} of {formatBytes(result.file_size)}
          </span>
        )}
        <StatusIndicator status={status}>{getStatusDisplay(status)}</StatusIndicator>
      </ToolHeader>

      {expanded && (
        <ToolDetails>
          <DetailSection>
            <div className="bg-code-bg flex flex-wrap gap-4 rounded px-2 py-1.5 text-[11px] leading-[1.4]">
              <div className="flex gap-1.5">
                <span className="font-medium text-gray-600">Path:</span>
                <span className="font-monospace break-all text-gray-200">{args.filePath}</span>
              </div>
              {args.offset !== undefined && (
                <div className="flex gap-1.5">
                  <span className="font-medium text-gray-600">Offset:</span>
                  <span className="font-monospace break-all text-gray-200">line {args.offset}</span>
                </div>
              )}
              {args.limit !== undefined && (
                <div className="flex gap-1.5">
                  <span className="font-medium text-gray-600">Limit:</span>
                  <span className="font-monospace break-all text-gray-200">{args.limit} lines</span>
                </div>
              )}
            </div>
          </DetailSection>

          {result && (
            <>
              {result.success === false && result.error && (
                <DetailSection>
                  <DetailLabel>Error</DetailLabel>
                  <div className="text-danger bg-danger-overlay border-danger rounded border-l-2 px-2 py-1.5 text-[11px]">
                    {result.error}
                  </div>
                </DetailSection>
              )}

              {result.success && result.content && parsedContent && (
                <DetailSection>
                  <DetailLabel>Content</DetailLabel>
                  <div className="bg-code-bg m-0 flex max-h-[200px] overflow-y-auto rounded px-2 py-1.5 text-[11px] leading-[1.4]">
                    <div className="font-monospace mr-2 min-w-10 border-r border-white/10 pr-3 text-right text-gray-600 opacity-40 select-none">
                      {parsedContent.lineNumbers.map((lineNum, i) => (
                        <div key={i}>{lineNum}</div>
                      ))}
                    </div>
                    <pre className="font-monospace m-0 flex-1 p-0 break-words whitespace-pre-wrap">
                      {parsedContent.actualContent}
                    </pre>
                  </div>
                </DetailSection>
              )}
            </>
          )}

          {status === "executing" && !result && (
            <DetailSection>
              <DetailContent>
                Reading file
                <LoadingDots />
              </DetailContent>
            </DetailSection>
          )}
        </ToolDetails>
      )}
    </ToolContainer>
  );
};

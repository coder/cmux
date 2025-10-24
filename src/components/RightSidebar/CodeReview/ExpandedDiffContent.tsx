/**
 * ExpandedDiffContent - Renders expanded context lines from read-more feature
 */

import React from "react";
import { SelectableDiffRenderer } from "../../shared/DiffRenderer";
import type { SearchHighlightConfig } from "@/utils/highlighting/highlightSearchTerms";

interface ExpandedDiffContentProps {
  /** Diff content to display */
  content: string;
  /** File path for syntax highlighting */
  filePath: string;
  /** Starting line number for line numbers */
  startLine: number;
  /** Search configuration for highlighting */
  searchConfig?: SearchHighlightConfig;
}

export const ExpandedDiffContent = React.memo<ExpandedDiffContentProps>(
  ({ content, filePath, startLine, searchConfig }) => {
    if (!content) return null;

    return (
      <div className="px-2 py-1.5">
        <SelectableDiffRenderer
          content={content}
          filePath={filePath}
          oldStart={startLine}
          newStart={startLine}
          maxHeight="none"
          searchConfig={searchConfig}
        />
      </div>
    );
  }
);

ExpandedDiffContent.displayName = "ExpandedDiffContent";

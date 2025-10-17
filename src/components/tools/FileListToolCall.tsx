import React from "react";
import type { FileListToolArgs, FileListToolResult, FileEntry } from "@/types/tools";
import { formatSize } from "@/services/tools/fileCommon";
import styles from "./FileListToolCall.module.css";

interface FileListToolCallProps {
  args: FileListToolArgs;
  result?: FileListToolResult;
  status: "pending" | "streaming" | "complete" | "error";
}

/**
 * Recursively render a file tree with indentation
 */
function renderFileTree(entries: FileEntry[], depth: number = 0): JSX.Element[] {
  const elements: JSX.Element[] = [];

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const prefix = depth === 0 ? "" : "│  ".repeat(depth - 1) + (isLast ? "└─ " : "├─ ");

    const icon = entry.type === "directory" ? "📁" : entry.type === "file" ? "📄" : "🔗";
    const suffix = entry.type === "directory" ? "/" : "";
    const sizeInfo = entry.size !== undefined ? ` (${formatSize(entry.size)})` : "";

    elements.push(
      <div key={`${depth}-${index}-${entry.name}`} className={styles.entry}>
        <span className={styles.prefix}>{prefix}</span>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.name}>
          {entry.name}
          {suffix}
        </span>
        {sizeInfo && <span className={styles.size}>{sizeInfo}</span>}
      </div>
    );

    // Recursively render children if present
    if (entry.children && entry.children.length > 0) {
      elements.push(...renderFileTree(entry.children, depth + 1));
    }
  });

  return elements;
}

export function FileListToolCall({ args, result, status }: FileListToolCallProps): JSX.Element {
  const isError = status === "error" || (result && !result.success);
  const isComplete = status === "complete";
  const isPending = status === "pending" || status === "streaming";

  // Build parameter summary
  const params: string[] = [];
  if (args.max_depth !== undefined && args.max_depth !== 1) {
    params.push(`depth: ${args.max_depth}`);
  }
  if (args.pattern) {
    params.push(`pattern: ${args.pattern}`);
  }
  if (args.gitignore === false) {
    params.push("gitignore: off");
  }
  if (args.max_entries) {
    params.push(`max: ${args.max_entries}`);
  }

  const paramStr = params.length > 0 ? ` (${params.join(", ")})` : "";

  return (
    <div className={`${styles.container} ${isError ? styles.error : ""}`}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.toolName}>📋 file_list:</span>
        <span className={styles.path}>{args.path}</span>
        <span className={styles.params}>{paramStr}</span>
        {isComplete && result && result.success && (
          <span className={styles.count}>{result.total_count} entries</span>
        )}
      </div>

      {/* Status */}
      {isPending && <div className={styles.status}>⏳ Listing directory...</div>}

      {/* Error */}
      {isError && result && !result.success && (
        <div className={styles.errorMessage}>
          <div className={styles.errorTitle}>❌ Error</div>
          <div className={styles.errorText}>{result.error}</div>
          {result.total_found !== undefined && (
            <div className={styles.errorHint}>
              Found {result.total_found}+ entries (limit: {result.limit_requested})
            </div>
          )}
        </div>
      )}

      {/* Success - Render tree */}
      {isComplete && result && result.success && (
        <div className={styles.treeContainer}>
          {result.entries.length === 0 ? (
            <div className={styles.empty}>Empty directory</div>
          ) : (
            <div className={styles.tree}>{renderFileTree(result.entries)}</div>
          )}
        </div>
      )}
    </div>
  );
}

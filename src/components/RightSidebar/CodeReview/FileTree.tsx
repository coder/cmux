/**
 * FileTree - Displays file hierarchy with diff statistics
 */

import React from "react";
import type { FileTreeNode } from "@/utils/git/numstatParser";
import { usePersistedState } from "@/hooks/usePersistedState";
import { getFileTreeExpandStateKey } from "@/constants/storage";
import { cn } from "@/lib/utils";

/**
 * Compute read status for a directory by recursively checking all descendant files
 * Returns "fully-read" if all files are fully read, "unknown" if any file has unknown status, null otherwise
 */
function computeDirectoryReadStatus(
  node: FileTreeNode,
  getFileReadStatus?: (filePath: string) => { total: number; read: number } | null
): "fully-read" | "unknown" | null {
  if (!node.isDirectory || !getFileReadStatus) return null;

  let hasUnknown = false;
  let fileCount = 0;
  let fullyReadCount = 0;

  const checkNode = (n: FileTreeNode) => {
    if (n.isDirectory) {
      // Recurse into children
      n.children.forEach(checkNode);
    } else {
      // Check file status
      fileCount++;
      const status = getFileReadStatus(n.path);
      if (status === null) {
        hasUnknown = true;
      } else if (status.read === status.total && status.total > 0) {
        fullyReadCount++;
      }
    }
  };

  checkNode(node);

  // If any file has unknown state, directory is unknown
  if (hasUnknown) return "unknown";

  // If all files are fully read, directory is fully read
  if (fileCount > 0 && fullyReadCount === fileCount) return "fully-read";

  // Otherwise, directory has partial/no read state
  return null;
}

const TreeNodeContent: React.FC<{
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string | null) => void;
  getFileReadStatus?: (filePath: string) => { total: number; read: number } | null;
  expandStateMap: Record<string, boolean>;
  setExpandStateMap: (
    value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void;
}> = ({
  node,
  depth,
  selectedPath,
  onSelectFile,
  getFileReadStatus,
  expandStateMap,
  setExpandStateMap,
}) => {
  // Check if user has manually set expand state for this directory
  const hasManualState = node.path in expandStateMap;
  const isOpen = hasManualState ? expandStateMap[node.path] : depth < 2; // Default: auto-expand first 2 levels

  const setIsOpen = (open: boolean) => {
    setExpandStateMap((prev) => ({
      ...prev,
      [node.path]: open,
    }));
  };

  const handleClick = (e: React.MouseEvent) => {
    if (node.isDirectory) {
      // Check if clicked on the toggle icon area (first 20px)
      const target = e.target as HTMLElement;
      const isToggleClick = target.closest("[data-toggle]");

      if (isToggleClick) {
        // Just toggle expansion
        setIsOpen(!isOpen);
      } else {
        // Clicking on folder name/stats selects the folder for filtering
        // Use full path (with prefix) for selection
        onSelectFile(selectedPath === node.path ? null : node.path);
      }
    } else {
      // Toggle selection: if already selected, clear filter
      // Use full path (with prefix) for selection
      onSelectFile(selectedPath === node.path ? null : node.path);
    }
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const isSelected = selectedPath === node.path;

  // Compute read status for files and directories
  let isFullyRead = false;
  let isUnknownState = false;

  if (node.isDirectory) {
    const dirStatus = computeDirectoryReadStatus(node, getFileReadStatus);
    isFullyRead = dirStatus === "fully-read";
    isUnknownState = dirStatus === "unknown";
  } else if (getFileReadStatus) {
    const readStatus = getFileReadStatus(node.path);
    isFullyRead = readStatus ? readStatus.read === readStatus.total && readStatus.total > 0 : false;
    isUnknownState = readStatus === null;
  }

  return (
    <>
      <div
        className={cn(
          "py-1 px-2 cursor-pointer select-none flex items-center gap-2 rounded my-0.5",
          isSelected ? "bg-code-keyword-overlay" : "bg-transparent hover:bg-white/5"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {node.isDirectory ? (
          <>
            <span
              className="inline-block w-3 transition-transform duration-200"
              style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
              data-toggle
              onClick={handleToggleClick}
            >
              ▶
            </span>
            <span
              className={cn(
                "flex-1",
                isFullyRead &&
                  "text-gray-200-dim line-through [text-decoration-color:var(--color-read)] [text-decoration-thickness:2px]",
                isUnknownState && !isFullyRead && "text-gray-200-dim",
                !isFullyRead && !isUnknownState && "text-gray-500"
              )}
            >
              {node.name || "/"}
            </span>
            {node.totalStats &&
              (node.totalStats.additions > 0 || node.totalStats.deletions > 0) && (
                <span
                  className="flex gap-2 text-[11px] opacity-70"
                  style={{ color: isOpen ? "#666" : "inherit" }}
                >
                  {node.totalStats.additions > 0 &&
                    (isOpen ? (
                      <span>+{node.totalStats.additions}</span>
                    ) : (
                      <span className="text-success-light">+{node.totalStats.additions}</span>
                    ))}
                  {node.totalStats.deletions > 0 &&
                    (isOpen ? (
                      <span>-{node.totalStats.deletions}</span>
                    ) : (
                      <span className="text-warning-light">-{node.totalStats.deletions}</span>
                    ))}
                </span>
              )}
          </>
        ) : (
          <>
            <span style={{ width: "12px" }} />
            <span
              className={cn(
                "flex-1",
                isFullyRead &&
                  "text-gray-200-dim line-through [text-decoration-color:var(--color-read)] [text-decoration-thickness:2px]",
                isUnknownState && !isFullyRead && "text-gray-200-dim",
                !isFullyRead && !isUnknownState && "text-gray-200"
              )}
            >
              {node.name}
            </span>
            {node.stats && (
              <span className="flex gap-2 text-[11px]">
                {node.stats.additions > 0 && (
                  <span className="text-success-light">+{node.stats.additions}</span>
                )}
                {node.stats.deletions > 0 && (
                  <span className="text-warning-light">-{node.stats.deletions}</span>
                )}
              </span>
            )}
          </>
        )}
      </div>

      {node.isDirectory &&
        isOpen &&
        node.children.map((child) => (
          <TreeNodeContent
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            getFileReadStatus={getFileReadStatus}
            expandStateMap={expandStateMap}
            setExpandStateMap={setExpandStateMap}
          />
        ))}
    </>
  );
};

interface FileTreeExternalProps {
  root: FileTreeNode | null;
  selectedPath: string | null;
  onSelectFile: (path: string | null) => void;
  isLoading?: boolean;
  getFileReadStatus?: (filePath: string) => { total: number; read: number } | null;
  workspaceId: string;
}

export const FileTree: React.FC<FileTreeExternalProps> = ({
  root,
  selectedPath,
  onSelectFile,
  isLoading = false,
  getFileReadStatus,
  workspaceId,
}) => {
  // Use persisted state for expand/collapse per workspace (lifted to parent to avoid O(n) re-renders)
  const [expandStateMap, setExpandStateMap] = usePersistedState<Record<string, boolean>>(
    getFileTreeExpandStateKey(workspaceId),
    {},
    { listener: true }
  );

  return (
    <>
      <div className="font-primary flex items-center gap-2 border-b border-gray-800 px-3 py-2 text-xs font-medium text-gray-200">
        <span>Files Changed</span>
        {selectedPath && (
          <button
            className="font-primary ml-auto cursor-pointer rounded-[3px] border-none bg-transparent px-2 py-0.5 text-[11px] text-gray-500 transition-all duration-200 hover:bg-white/5 hover:text-gray-200"
            onClick={() => onSelectFile(null)}
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="font-monospace min-h-0 flex-1 overflow-y-auto p-3 text-xs">
        {isLoading && !root ? (
          <div className="py-5 text-center text-gray-500">Loading file tree...</div>
        ) : root ? (
          root.children.map((child) => (
            <TreeNodeContent
              key={child.path}
              node={child}
              depth={0}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              getFileReadStatus={getFileReadStatus}
              expandStateMap={expandStateMap}
              setExpandStateMap={setExpandStateMap}
            />
          ))
        ) : (
          <div className="py-5 text-center text-gray-500">No files changed</div>
        )}
      </div>
    </>
  );
};

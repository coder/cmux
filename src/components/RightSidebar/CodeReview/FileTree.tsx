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
  commonPrefix: string | null;
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
  commonPrefix,
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
          isSelected ? "bg-[rgba(100,150,255,0.2)]" : "bg-transparent hover:bg-white/5"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {node.isDirectory ? (
          <>
            <span
              className="w-3 inline-block transition-transform duration-200"
              style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
              data-toggle
              onClick={handleToggleClick}
            >
              ▶
            </span>
            <span
              className={cn(
                "flex-1",
                isFullyRead && "text-[#666] line-through [text-decoration-color:var(--color-read)] [text-decoration-thickness:2px]",
                isUnknownState && !isFullyRead && "text-[#666]",
                !isFullyRead && !isUnknownState && "text-[#888]"
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
                      <span className="text-[#4ade80]">+{node.totalStats.additions}</span>
                    ))}
                  {node.totalStats.deletions > 0 &&
                    (isOpen ? (
                      <span>-{node.totalStats.deletions}</span>
                    ) : (
                      <span className="text-[#f87171]">-{node.totalStats.deletions}</span>
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
                isFullyRead && "text-[#666] line-through [text-decoration-color:var(--color-read)] [text-decoration-thickness:2px]",
                isUnknownState && !isFullyRead && "text-[#666]",
                !isFullyRead && !isUnknownState && "text-[#ccc]"
              )}
            >
              {node.name}
            </span>
            {node.stats && (
              <span className="flex gap-2 text-[11px]">
                {node.stats.additions > 0 && <span className="text-[#4ade80]">+{node.stats.additions}</span>}
                {node.stats.deletions > 0 && <span className="text-[#f87171]">-{node.stats.deletions}</span>}
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
            commonPrefix={commonPrefix}
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
  commonPrefix?: string | null;
  getFileReadStatus?: (filePath: string) => { total: number; read: number } | null;
  workspaceId: string;
}

export const FileTree: React.FC<FileTreeExternalProps> = ({
  root,
  selectedPath,
  onSelectFile,
  isLoading = false,
  commonPrefix = null,
  getFileReadStatus,
  workspaceId,
}) => {
  // Use persisted state for expand/collapse per workspace (lifted to parent to avoid O(n) re-renders)
  const [expandStateMap, setExpandStateMap] = usePersistedState<Record<string, boolean>>(
    getFileTreeExpandStateKey(workspaceId),
    {},
    { listener: true }
  );

  // Find the node at the common prefix path to start rendering from
  const startNode = React.useMemo(() => {
    if (!commonPrefix || !root) return root;

    // Navigate to the node at the common prefix path
    const parts = commonPrefix.split("/");
    let current = root;

    for (const part of parts) {
      const child = current.children.find((c) => c.name === part);
      if (!child) return root; // Fallback if path not found
      current = child;
    }

    return current;
  }, [root, commonPrefix]);

  return (
    <>
      <div className="py-2 px-3 border-b border-[#3e3e42] text-xs font-medium text-[#ccc] font-primary flex items-center gap-2">
        <span>Files Changed</span>
        {selectedPath && (
          <button
            className="py-0.5 px-2 bg-transparent text-[#888] border-none rounded-[3px] text-[11px] cursor-pointer transition-all duration-200 font-primary ml-auto hover:bg-white/5 hover:text-[#ccc]"
            onClick={() => onSelectFile(null)}
          >
            Clear filter
          </button>
        )}
      </div>
      {commonPrefix && (
        <div className="py-1.5 px-3 bg-[#1e1e1e] border-b border-[#3e3e42] text-[11px] text-[#888] font-monospace">
          {commonPrefix}/
        </div>
      )}
      <div className="flex-1 min-h-0 p-3 overflow-y-auto font-monospace text-xs">
        {isLoading && !startNode ? (
          <div className="py-5 text-[#888] text-center">Loading file tree...</div>
        ) : startNode ? (
          startNode.children.map((child) => (
            <TreeNodeContent
              key={child.path}
              node={child}
              depth={0}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              commonPrefix={commonPrefix}
              getFileReadStatus={getFileReadStatus}
              expandStateMap={expandStateMap}
              setExpandStateMap={setExpandStateMap}
            />
          ))
        ) : (
          <div className="py-5 text-[#888] text-center">No files changed</div>
        )}
      </div>
    </>
  );
};

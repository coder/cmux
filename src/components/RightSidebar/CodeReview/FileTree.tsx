/**
 * FileTree - Displays file hierarchy with diff statistics
 */

import React from "react";
import styled from "@emotion/styled";
import type { FileTreeNode } from "@/utils/git/numstatParser";
import { usePersistedState } from "@/hooks/usePersistedState";
import { getFileTreeExpandStateKey } from "@/constants/storage";

const TreeContainer = styled.div`
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
  font-family: var(--font-monospace);
  font-size: 12px;
`;

const TreeNode = styled.div<{ depth: number; isSelected: boolean }>`
  padding: 4px 8px;
  padding-left: ${(props) => props.depth * 16 + 8}px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
  background: ${(props) => (props.isSelected ? "rgba(100, 150, 255, 0.2)" : "transparent")};
  border-radius: 4px;
  margin: 2px 0;

  &:hover {
    background: ${(props) =>
      props.isSelected ? "rgba(100, 150, 255, 0.2)" : "rgba(255, 255, 255, 0.05)"};
  }
`;

const FileName = styled.span<{ isFullyRead?: boolean; isUnknownState?: boolean }>`
  color: #ccc;
  flex: 1;
  ${(props) =>
    props.isFullyRead &&
    `
    color: #666;
    text-decoration: line-through;
    text-decoration-color: var(--color-read);
    text-decoration-thickness: 2px;
  `}
  ${(props) =>
    props.isUnknownState &&
    !props.isFullyRead &&
    `
    color: #666;
  `}
`;

const DirectoryName = styled.span<{ isFullyRead?: boolean; isUnknownState?: boolean }>`
  color: #888;
  flex: 1;
  ${(props) =>
    props.isFullyRead &&
    `
    color: #666;
    text-decoration: line-through;
    text-decoration-color: var(--color-read);
    text-decoration-thickness: 2px;
  `}
  ${(props) =>
    props.isUnknownState &&
    !props.isFullyRead &&
    `
    color: #666;
  `}
`;

const DirectoryStats = styled.span<{ isOpen: boolean }>`
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: ${(props) => (props.isOpen ? "#666" : "inherit")};
  opacity: 0.7;
`;

const Stats = styled.span`
  display: flex;
  gap: 8px;
  font-size: 11px;
`;

const Additions = styled.span`
  color: #4ade80;
`;

const Deletions = styled.span`
  color: #f87171;
`;

const ToggleIcon = styled.span<{ isOpen: boolean }>`
  width: 12px;
  display: inline-block;
  transform: ${(props) => (props.isOpen ? "rotate(90deg)" : "rotate(0deg)")};
  transition: transform 0.2s ease;
`;

const ClearButton = styled.button`
  padding: 2px 8px;
  background: transparent;
  color: #888;
  border: none;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);
  margin-left: auto;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ccc;
  }
`;

const TreeHeader = styled.div`
  padding: 8px 12px;
  border-bottom: 1px solid #3e3e42;
  font-size: 12px;
  font-weight: 500;
  color: #ccc;
  font-family: var(--font-primary);
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CommonPrefix = styled.div`
  padding: 6px 12px;
  background: #1e1e1e;
  border-bottom: 1px solid #3e3e42;
  font-size: 11px;
  color: #888;
  font-family: var(--font-monospace);
`;

const EmptyState = styled.div`
  padding: 20px;
  color: #888;
  text-align: center;
`;

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
      <TreeNode depth={depth} isSelected={isSelected} onClick={handleClick}>
        {node.isDirectory ? (
          <>
            <ToggleIcon isOpen={isOpen} data-toggle onClick={handleToggleClick}>
              ▶
            </ToggleIcon>
            <DirectoryName isFullyRead={isFullyRead} isUnknownState={isUnknownState}>
              {node.name || "/"}
            </DirectoryName>
            {node.totalStats &&
              (node.totalStats.additions > 0 || node.totalStats.deletions > 0) && (
                <DirectoryStats isOpen={isOpen}>
                  {node.totalStats.additions > 0 &&
                    (isOpen ? (
                      <span>+{node.totalStats.additions}</span>
                    ) : (
                      <Additions>+{node.totalStats.additions}</Additions>
                    ))}
                  {node.totalStats.deletions > 0 &&
                    (isOpen ? (
                      <span>-{node.totalStats.deletions}</span>
                    ) : (
                      <Deletions>-{node.totalStats.deletions}</Deletions>
                    ))}
                </DirectoryStats>
              )}
          </>
        ) : (
          <>
            <span style={{ width: "12px" }} />
            <FileName isFullyRead={isFullyRead} isUnknownState={isUnknownState}>
              {node.name}
            </FileName>
            {node.stats && (
              <Stats>
                {node.stats.additions > 0 && <Additions>+{node.stats.additions}</Additions>}
                {node.stats.deletions > 0 && <Deletions>-{node.stats.deletions}</Deletions>}
              </Stats>
            )}
          </>
        )}
      </TreeNode>

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
      <TreeHeader>
        <span>Files Changed</span>
        {selectedPath && <ClearButton onClick={() => onSelectFile(null)}>Clear filter</ClearButton>}
      </TreeHeader>
      {commonPrefix && <CommonPrefix>{commonPrefix}/</CommonPrefix>}
      <TreeContainer>
        {isLoading && !startNode ? (
          <EmptyState>Loading file tree...</EmptyState>
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
          <EmptyState>No files changed</EmptyState>
        )}
      </TreeContainer>
    </>
  );
};

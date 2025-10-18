/**
 * Parse git diff --numstat output
 * Format: <additions>\t<deletions>\t<filepath>
 */

export interface FileStats {
  filePath: string;
  additions: number;
  deletions: number;
}

/**
 * Parse git diff --numstat output into structured file stats
 */
export function parseNumstat(numstatOutput: string): FileStats[] {
  const lines = numstatOutput.trim().split("\n").filter(Boolean);
  const stats: FileStats[] = [];

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length !== 3) continue;

    const [addStr, delStr, filePath] = parts;
    
    // Handle binary files (marked with "-" for additions/deletions)
    const additions = addStr === "-" ? 0 : parseInt(addStr, 10);
    const deletions = delStr === "-" ? 0 : parseInt(delStr, 10);

    if (!isNaN(additions) && !isNaN(deletions)) {
      stats.push({
        filePath,
        additions,
        deletions,
      });
    }
  }

  return stats;
}

/**
 * Build a tree structure from flat file paths
 */
export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
  stats?: FileStats;
}

export function buildFileTree(fileStats: FileStats[]): FileTreeNode {
  const root: FileTreeNode = {
    name: "",
    path: "",
    isDirectory: true,
    children: [],
  };

  for (const stat of fileStats) {
    const parts = stat.filePath.split("/");
    let currentNode = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLastPart = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join("/");

      let childNode = currentNode.children.find((c) => c.name === part);

      if (!childNode) {
        childNode = {
          name: part,
          path: pathSoFar,
          isDirectory: !isLastPart,
          children: [],
          stats: isLastPart ? stat : undefined,
        };
        currentNode.children.push(childNode);
      }

      currentNode = childNode;
    }
  }

  return root;
}


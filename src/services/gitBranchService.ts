/**
 * Service for fetching and parsing git branch information.
 * Coordinates bash script execution, output parsing, and show-branch processing.
 */

import { z } from "zod";
import { strict as assert } from "node:assert";
import { buildGitBranchScript, SECTION_MARKERS } from "@/utils/git/branchScript";
import { parseGitShowBranch, type GitCommit, type GitBranchHeader } from "@/utils/git/parseGitLog";

const GitBranchDataSchema = z.object({
  showBranch: z.string(),
  dates: z.array(
    z.object({
      hash: z.string().min(1, "commit hash must not be empty"),
      date: z.string().min(1, "commit date must not be empty"),
    })
  ),
  dirtyFiles: z.array(z.string()),
});

type GitBranchData = z.infer<typeof GitBranchDataSchema>;

interface ParsedScriptResultSuccess {
  success: true;
  data: GitBranchData;
}

interface ParsedScriptResultFailure {
  success: false;
  error: string;
}

type ParsedScriptResult = ParsedScriptResultSuccess | ParsedScriptResultFailure;

function extractSection(output: string, startMarker: string, endMarker: string): string | null {
  const startIndex = output.indexOf(startMarker);
  const endIndex = output.indexOf(endMarker);

  assert(
    startIndex !== -1 && endIndex !== -1 && endIndex > startIndex,
    `Expected script output to contain markers ${startMarker} and ${endMarker}, but it did not.`
  );

  const rawSection = output.slice(startIndex + startMarker.length, endIndex);
  const sectionWithoutLeadingNewline = rawSection.replace(/^\r?\n/, "");
  return sectionWithoutLeadingNewline.replace(/\r?\n$/, "");
}

function parseGitBranchScriptOutput(rawOutput: string): ParsedScriptResult {
  const normalizedOutput = rawOutput.replace(/\r\n/g, "\n").trim();
  assert(normalizedOutput.length > 0, "Expected git script output to be non-empty");

  const showBranch = extractSection(
    normalizedOutput,
    SECTION_MARKERS.showBranchStart,
    SECTION_MARKERS.showBranchEnd
  );
  if (showBranch === null) {
    return { success: false, error: "Missing branch details from git script output." };
  }

  const datesRaw = extractSection(
    normalizedOutput,
    SECTION_MARKERS.datesStart,
    SECTION_MARKERS.datesEnd
  );
  if (datesRaw === null) {
    return { success: false, error: "Missing commit dates from git script output." };
  }

  const dirtyRaw = extractSection(
    normalizedOutput,
    SECTION_MARKERS.dirtyStart,
    SECTION_MARKERS.dirtyEnd
  );
  if (dirtyRaw === null) {
    return { success: false, error: "Missing dirty file list from git script output." };
  }

  const dates = datesRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [hash, ...dateParts] = line.split("|");
      const date = dateParts.join("|").trim();
      assert(hash.length > 0, "Expected git log output to provide a commit hash.");
      assert(date.length > 0, "Expected git log output to provide a commit date.");
      return { hash, date };
    });

  const dirtyFiles = dirtyRaw
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.length > 0);

  const parsedDataResult = GitBranchDataSchema.safeParse({
    showBranch,
    dates,
    dirtyFiles,
  });

  if (!parsedDataResult.success) {
    const errorMessage = parsedDataResult.error.issues.map((issue) => issue.message).join(", ");
    return { success: false, error: `Invalid data format from git script: ${errorMessage}` };
  }

  return { success: true, data: parsedDataResult.data };
}

export interface GitBranchInfoSuccess {
  success: true;
  headers: GitBranchHeader[];
  commits: GitCommit[];
  dirtyFiles: string[];
}

export interface GitBranchInfoFailure {
  success: false;
  error: string;
}

export type GitBranchInfoResult = GitBranchInfoSuccess | GitBranchInfoFailure;

/**
 * Fetches git branch information for a workspace.
 * Executes bash script, parses output, and processes show-branch data.
 *
 * @param workspaceId - Workspace to fetch git info for
 * @param includeDirtyFiles - Whether to include dirty file listing
 * @returns Result with branch headers, commits, and dirty files, or error
 */
export async function fetchGitBranchInfo(
  workspaceId: string,
  includeDirtyFiles: boolean
): Promise<GitBranchInfoResult> {
  assert(workspaceId.trim().length > 0, "fetchGitBranchInfo expects a non-empty workspaceId");

  const script = buildGitBranchScript(includeDirtyFiles);
  assert(script.length > 0, "buildGitBranchScript must return a non-empty script");

  const result = await window.api.workspace.executeBash(workspaceId, script, {
    timeout_secs: 5,
    niceness: 19, // Lowest priority - don't interfere with user operations
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!result.data.success) {
    const errorMsg = result.data.output
      ? result.data.output.trim()
      : result.data.error || "Unknown error";
    return { success: false, error: errorMsg };
  }

  const parseResult = parseGitBranchScriptOutput(result.data.output ?? "");
  if (!parseResult.success) {
    return { success: false, error: parseResult.error };
  }

  const gitData = parseResult.data;
  assert(gitData.showBranch !== undefined, "parseResult.data must contain showBranch");
  assert(Array.isArray(gitData.dates), "parseResult.data.dates must be an array");
  assert(Array.isArray(gitData.dirtyFiles), "parseResult.data.dirtyFiles must be an array");

  // Build date map from validated data
  const dateMap = new Map<string, string>(gitData.dates.map((d) => [d.hash, d.date]));

  // Parse show-branch output
  const parsed = parseGitShowBranch(gitData.showBranch, dateMap);
  if (parsed.commits.length === 0) {
    return { success: false, error: "Unable to parse branch info" };
  }

  assert(Array.isArray(parsed.headers), "parseGitShowBranch must return headers array");
  assert(Array.isArray(parsed.commits), "parseGitShowBranch must return commits array");
  assert(parsed.commits.length > 0, "parseGitShowBranch must return at least one commit");

  return {
    success: true,
    headers: parsed.headers,
    commits: parsed.commits,
    dirtyFiles: gitData.dirtyFiles,
  };
}

/**
 * Git branch information script generation.
 * Generates a bash script that retrieves branch details, commit dates, and optionally dirty files.
 */

import { assert } from "../assert";

export const SECTION_MARKERS = {
  showBranchStart: "__CMUX_BRANCH_DATA__BEGIN_SHOW_BRANCH__",
  showBranchEnd: "__CMUX_BRANCH_DATA__END_SHOW_BRANCH__",
  datesStart: "__CMUX_BRANCH_DATA__BEGIN_DATES__",
  datesEnd: "__CMUX_BRANCH_DATA__END_DATES__",
  dirtyStart: "__CMUX_BRANCH_DATA__BEGIN_DIRTY_FILES__",
  dirtyEnd: "__CMUX_BRANCH_DATA__END_DIRTY_FILES__",
} as const;

/**
 * Builds a bash script that retrieves git branch information.
 * The script outputs sections delimited by markers for parsing.
 *
 * @param includeDirtyFiles - Whether to include dirty file listing in output
 * @returns Bash script as a string
 */
export function buildGitBranchScript(includeDirtyFiles: boolean): string {
  const getDirtyFiles = includeDirtyFiles
    ? "DIRTY_FILES=$(git status --porcelain 2>/dev/null | head -20)"
    : "DIRTY_FILES=''";

  const script = `
# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

# Get primary branch (main or master)
PRIMARY_BRANCH=$(git branch -r 2>/dev/null | grep -E 'origin/(main|master)$' | head -1 | sed 's@^.*origin/@@' || echo "main")

if [ -z "$PRIMARY_BRANCH" ]; then
  PRIMARY_BRANCH="main"
fi

# Build refs list for show-branch
REFS="HEAD origin/$PRIMARY_BRANCH"

# Check if origin/<current-branch> exists and is different from primary
if [ "$CURRENT_BRANCH" != "$PRIMARY_BRANCH" ] && git rev-parse --verify "origin/$CURRENT_BRANCH" >/dev/null 2>&1; then
  REFS="$REFS origin/$CURRENT_BRANCH"
fi

# Get show-branch output
SHOW_BRANCH=$(git show-branch --sha1-name $REFS 2>/dev/null || echo "")

# Extract all hashes and get dates in ONE git log call
HASHES=$(printf '%s\\n' "$SHOW_BRANCH" | grep -oE '\\[[a-f0-9]+\\]' | tr -d '[]' | tr '\\n' ' ')
if [ -n "$HASHES" ]; then
  DATES_OUTPUT=$(git log --no-walk --format='%h|%ad' --date=format:'%b %d %I:%M %p' $HASHES 2>/dev/null || echo "")
else
  DATES_OUTPUT=""
fi

# Get dirty files if requested
${getDirtyFiles}

printf '${SECTION_MARKERS.showBranchStart}\\n%s\\n${SECTION_MARKERS.showBranchEnd}\\n' "$SHOW_BRANCH"
printf '${SECTION_MARKERS.datesStart}\\n%s\\n${SECTION_MARKERS.datesEnd}\\n' "$DATES_OUTPUT"
printf '${SECTION_MARKERS.dirtyStart}\\n%s\\n${SECTION_MARKERS.dirtyEnd}\\n' "$DIRTY_FILES"
`;

  // Verify the script contains all required markers
  assert(
    script.includes(SECTION_MARKERS.showBranchStart) &&
      script.includes(SECTION_MARKERS.showBranchEnd) &&
      script.includes(SECTION_MARKERS.datesStart) &&
      script.includes(SECTION_MARKERS.datesEnd) &&
      script.includes(SECTION_MARKERS.dirtyStart) &&
      script.includes(SECTION_MARKERS.dirtyEnd),
    "Generated script must contain all section markers"
  );

  return script;
}

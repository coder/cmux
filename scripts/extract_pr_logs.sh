#!/usr/bin/env bash
# Extract logs from failed GitHub Actions run
# Usage: ./scripts/extract_pr_logs.sh <run_id> [job_name_pattern]
# Example: ./scripts/extract_pr_logs.sh 18640062283 "Integration"
#
# To find run_id:
#   - From PR: gh pr checks <pr_number> --watch
#   - From Actions page: https://github.com/coder/cmux/actions
#   - From failed check URL: https://github.com/coder/cmux/actions/runs/<run_id>/job/<job_id>

set -euo pipefail

RUN_ID="${1:-}"
JOB_PATTERN="${2:-}"

if [[ -z "$RUN_ID" ]]; then
  echo "❌ Usage: $0 <run_id> [job_name_pattern]" >&2
  echo "" >&2
  echo "Example:" >&2
  echo "  $0 18640062283              # All jobs from this run" >&2
  echo "  $0 18640062283 Integration  # Only Integration Test jobs" >&2
  echo "" >&2
  echo "To find run_id:" >&2
  echo "  - From PR: gh pr checks <pr_number>" >&2
  echo "  - From Actions: https://github.com/coder/cmux/actions" >&2
  echo "  - From URL: https://github.com/coder/cmux/actions/runs/<run_id>/job/<job_id>" >&2
  exit 1
fi

echo "📋 Fetching logs for run $RUN_ID..." >&2

# Get all jobs for this run
JOBS=$(gh run view "$RUN_ID" --json jobs -q '.jobs[]' 2>/dev/null)

if [[ -z "$JOBS" ]]; then
  echo "❌ No jobs found for run $RUN_ID" >&2
  echo "" >&2
  echo "Check if run ID is correct:" >&2
  echo "  gh run list --limit 10" >&2
  exit 1
fi

# Parse jobs and filter by pattern if provided
if [[ -n "$JOB_PATTERN" ]]; then
  MATCHING_JOBS=$(echo "$JOBS" | jq -r "select(.name | test(\"$JOB_PATTERN\"; \"i\")) | .databaseId")
  if [[ -z "$MATCHING_JOBS" ]]; then
    echo "❌ No jobs matching pattern '$JOB_PATTERN'" >&2
    echo "" >&2
    echo "Available jobs:" >&2
    echo "$JOBS" | jq -r '.name' >&2
    exit 1
  fi
  JOB_IDS="$MATCHING_JOBS"
else
  JOB_IDS=$(echo "$JOBS" | jq -r '.databaseId')
fi

# Extract and display logs for each job
for JOB_ID in $JOB_IDS; do
  JOB_INFO=$(echo "$JOBS" | jq -r "select(.databaseId == $JOB_ID)")
  JOB_NAME=$(echo "$JOB_INFO" | jq -r '.name')
  JOB_STATUS=$(echo "$JOB_INFO" | jq -r '.conclusion // .status')
  
  echo "" >&2
  echo "════════════════════════════════════════════════════════════" >&2
  echo "Job: $JOB_NAME (ID: $JOB_ID) - $JOB_STATUS" >&2
  echo "════════════════════════════════════════════════════════════" >&2
  echo "" >&2
  
  # Fetch logs (redirect stderr to hide "Still processing" messages)
  gh run view "$RUN_ID" --log --job "$JOB_ID" 2>/dev/null || {
    echo "⚠️  Could not fetch logs for job $JOB_ID" >&2
    echo "   (logs may still be processing or have expired)" >&2
  }
done


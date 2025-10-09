#!/usr/bin/env bash
set -euo pipefail

# Wait for PR checks to complete
# Usage: ./scripts/wait_pr_checks.sh <pr_number>

if [ $# -eq 0 ]; then
  echo "Usage: $0 <pr_number>"
  exit 1
fi

PR_NUMBER=$1
echo "⏳ Waiting for PR #$PR_NUMBER checks to complete..."
echo ""

while true; do
  # Get PR status
  STATUS=$(gh pr view "$PR_NUMBER" --json mergeable,mergeStateStatus,state 2>/dev/null || echo "error")

  if [ "$STATUS" = "error" ]; then
    echo "❌ Failed to get PR status. Does PR #$PR_NUMBER exist?"
    exit 1
  fi

  PR_STATE=$(echo "$STATUS" | jq -r '.state')

  # Check if PR is already merged
  if [ "$PR_STATE" = "MERGED" ]; then
    echo "✅ PR #$PR_NUMBER has been merged!"
    exit 0
  fi

  MERGEABLE=$(echo "$STATUS" | jq -r '.mergeable')
  MERGE_STATE=$(echo "$STATUS" | jq -r '.mergeStateStatus')

  # Check for bad merge status
  if [ "$MERGEABLE" = "CONFLICTING" ]; then
    echo "❌ PR has merge conflicts!"
    exit 1
  fi

  if [ "$MERGE_STATE" = "DIRTY" ]; then
    echo "❌ PR has merge conflicts!"
    exit 1
  fi

  if [ "$MERGE_STATE" = "BEHIND" ]; then
    echo "❌ PR is behind base branch. Rebase needed."
    echo ""
    echo "Run:"
    echo "  git fetch origin"
    echo "  git rebase origin/main"
    echo "  git push --force-with-lease"
    exit 1
  fi

  # Get check status
  CHECKS=$(gh pr checks "$PR_NUMBER" 2>&1 || echo "pending")

  # Check for failures
  if echo "$CHECKS" | grep -q "fail"; then
    echo "❌ Some checks failed:"
    echo ""
    gh pr checks "$PR_NUMBER"
    exit 1
  fi

  # Check for unresolved review comments in the hot loop
  if ! ./scripts/check_pr_reviews.sh "$PR_NUMBER" >/dev/null 2>&1; then
    echo ""
    echo "❌ Unresolved review comments found!"
    ./scripts/check_pr_reviews.sh "$PR_NUMBER"
    exit 1
  fi

  # Check if all checks passed and merge state is clean
  if echo "$CHECKS" | grep -q "pass" && ! echo "$CHECKS" | grep -qE "pending|fail"; then
    if [ "$MERGE_STATE" = "CLEAN" ]; then
      # Check for unresolved Codex comments
      echo "✅ All checks passed!"
      echo ""
      gh pr checks "$PR_NUMBER"
      echo ""
      echo "🤖 Checking for unresolved Codex comments..."
      if ./scripts/check_codex_comments.sh "$PR_NUMBER"; then
        echo ""
        echo "✅ PR is ready to merge!"
        exit 0
      else
        echo ""
        echo "❌ Please resolve Codex comments before merging."
        exit 1
      fi
    elif [ "$MERGE_STATE" = "BLOCKED" ]; then
      echo "⏳ All checks passed but still blocked (waiting for required checks)..."
    fi
  else
    # Show current status
    echo -ne "\r⏳ Checks in progress... (${MERGE_STATE})  "
  fi

  sleep 5
done

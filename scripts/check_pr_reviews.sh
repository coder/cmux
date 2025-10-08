#!/usr/bin/env bash
# Check for unresolved PR review comments
# Usage: ./scripts/check_pr_reviews.sh <pr_number>
# Exits 0 if all resolved, 1 if unresolved comments exist

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <pr_number>"
  exit 1
fi

PR_NUMBER="$1"

# Query for unresolved review threads
UNRESOLVED=$(gh api graphql -f query="
{
  repository(owner: \"coder\", name: \"cmux\") {
    pullRequest(number: $PR_NUMBER) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 1) {
            nodes {
              author { login }
              body
              diffHunk
              commit { oid }
            }
          }
        }
      }
    }
  }
}" --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .comments.nodes[0] | {user: .author.login, body: .body, diff_hunk: .diffHunk, commit_id: .commit.oid}')

if [ -n "$UNRESOLVED" ]; then
  echo "❌ Unresolved review comments found:"
  echo "$UNRESOLVED" | jq -r '"  \(.user): \(.body)"'
  echo ""
  echo "View PR: https://github.com/coder/cmux/pull/$PR_NUMBER"
  exit 1
fi

echo "✅ All review comments resolved"
exit 0

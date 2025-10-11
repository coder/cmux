#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <review_thread_id>"
  echo "Example: $0 PRRT_abc123"
  exit 1
fi

THREAD_ID="$1"

MUTATION='mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread {
      id
      isResolved
    }
  }
}'

echo "Resolving review thread $THREAD_ID..."

RESULT=$(gh api graphql \
  -f query="$MUTATION" \
  -F threadId="$THREAD_ID")

RESOLVED=$(echo "$RESULT" | jq -r '.data.resolveReviewThread.thread.isResolved')

if [ "$RESOLVED" == "true" ]; then
  echo "✅ Thread $THREAD_ID resolved"
else
  echo "❌ Failed to resolve thread $THREAD_ID"
  echo "$RESULT"
  exit 1
fi

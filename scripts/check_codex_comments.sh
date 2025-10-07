#!/usr/bin/env bash
set -euo pipefail

# Check if PR number is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <pr_number>"
    exit 1
fi

PR_NUMBER=$1
BOT_LOGIN="chatgpt-codex-connector[bot]"

echo "Checking for unresolved Codex comments in PR #${PR_NUMBER}..."

# Get all comments from the Codex bot
# This includes both regular PR comments and review comments
REGULAR_COMMENTS=$(gh api "/repos/{owner}/{repo}/issues/${PR_NUMBER}/comments" \
    --jq "[.[] | select(.user.login == \"${BOT_LOGIN}\")]")

REVIEW_COMMENTS=$(gh api "/repos/{owner}/{repo}/pulls/${PR_NUMBER}/comments" \
    --jq "[.[] | select(.user.login == \"${BOT_LOGIN}\")]")

# Count regular comments (these are always considered unresolved unless deleted)
REGULAR_COUNT=$(echo "$REGULAR_COMMENTS" | jq 'length')

# For review comments, GitHub doesn't expose a direct "resolved" field via the API
# However, we can check the review thread state via GraphQL
# For simplicity, we'll check if there are any review comments at all
REVIEW_COUNT=$(echo "$REVIEW_COMMENTS" | jq 'length')

echo "Found ${REGULAR_COUNT} regular comment(s) from ${BOT_LOGIN}"
echo "Found ${REVIEW_COUNT} review comment(s) from ${BOT_LOGIN}"

# If there are any comments from Codex, we consider them unresolved
# (unless they're explicitly marked as resolved or deleted)
TOTAL_COMMENTS=$((REGULAR_COUNT + REVIEW_COUNT))

if [ $TOTAL_COMMENTS -gt 0 ]; then
    echo ""
    echo "❌ Found ${TOTAL_COMMENTS} comment(s) from ${BOT_LOGIN} in PR #${PR_NUMBER}"
    echo ""
    echo "Codex comments:"
    
    if [ $REGULAR_COUNT -gt 0 ]; then
        echo "$REGULAR_COMMENTS" | jq -r '.[] | "  - [\(.created_at)] \(.body[0:100] | gsub("\n"; " "))..."'
    fi
    
    if [ $REVIEW_COUNT -gt 0 ]; then
        echo "$REVIEW_COMMENTS" | jq -r '.[] | "  - [\(.created_at)] \(.path):\(.line) - \(.body[0:100] | gsub("\n"; " "))..."'
    fi
    
    echo ""
    echo "Please address or resolve all Codex comments before merging."
    exit 1
else
    echo "✅ No unresolved Codex comments found"
    exit 0
fi

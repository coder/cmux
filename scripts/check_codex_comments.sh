#!/usr/bin/env bash
set -euo pipefail

# Check if PR number is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <pr_number>"
    exit 1
fi

PR_NUMBER=$1
BOT_LOGIN_REST="chatgpt-codex-connector[bot]"  # REST API uses [bot] suffix
BOT_LOGIN_GRAPHQL="chatgpt-codex-connector"    # GraphQL does not

echo "Checking for unresolved Codex comments in PR #${PR_NUMBER}..."

# Get all regular issue comments from the Codex bot (these can't be resolved)
REGULAR_COMMENTS=$(gh api "/repos/{owner}/{repo}/issues/${PR_NUMBER}/comments" \
    --jq "[.[] | select(.user.login == \"${BOT_LOGIN_REST}\")]")

REGULAR_COUNT=$(echo "$REGULAR_COMMENTS" | jq 'length')

# Use GraphQL to get review threads and their resolution status
# Only count threads from the bot that are NOT resolved
GRAPHQL_QUERY='query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 1) {
            nodes {
              author {
                login
              }
              body
              createdAt
              path
              line
            }
          }
        }
      }
    }
  }
}'

# Extract owner and repo from gh cli
REPO_INFO=$(gh repo view --json owner,name --jq '{owner: .owner.login, name: .name}')
OWNER=$(echo "$REPO_INFO" | jq -r '.owner')
REPO=$(echo "$REPO_INFO" | jq -r '.name')

# Query for unresolved review threads from the bot
UNRESOLVED_THREADS=$(gh api graphql \
    -f query="$GRAPHQL_QUERY" \
    -F owner="$OWNER" \
    -F repo="$REPO" \
    -F pr="$PR_NUMBER" \
    --jq "[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false and .comments.nodes[0].author.login == \"${BOT_LOGIN_GRAPHQL}\")]")

UNRESOLVED_COUNT=$(echo "$UNRESOLVED_THREADS" | jq 'length')

echo "Found ${REGULAR_COUNT} regular comment(s) from bot"
echo "Found ${UNRESOLVED_COUNT} unresolved review thread(s) from bot"

# If there are any unresolved comments or threads from Codex, fail
TOTAL_UNRESOLVED=$((REGULAR_COUNT + UNRESOLVED_COUNT))

if [ $TOTAL_UNRESOLVED -gt 0 ]; then
    echo ""
    echo "❌ Found ${TOTAL_UNRESOLVED} unresolved comment(s) from Codex in PR #${PR_NUMBER}"
    echo ""
    echo "Codex comments:"
    
    if [ $REGULAR_COUNT -gt 0 ]; then
        echo "$REGULAR_COMMENTS" | jq -r '.[] | "  - [\(.created_at)] \(.body[0:100] | gsub("\n"; " "))..."'
    fi
    
    if [ $UNRESOLVED_COUNT -gt 0 ]; then
        echo "$UNRESOLVED_THREADS" | jq -r '.[] | "  - [\(.comments.nodes[0].createdAt)] \(.comments.nodes[0].path // "comment"):\(.comments.nodes[0].line // "") - \(.comments.nodes[0].body[0:100] | gsub("\n"; " "))..."'
    fi
    
    echo ""
    echo "Please address or resolve all Codex comments before merging."
    exit 1
else
    echo "✅ No unresolved Codex comments found"
    exit 0
fi

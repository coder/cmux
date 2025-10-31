#!/usr/bin/env bash

set -euo pipefail

log() {
  printf '[cmux-run] %s\n' "$1"
}

fatal() {
  printf '[cmux-run] ERROR: %s\n' "$1" >&2
  exit 1
}

instruction=${1:-}
if [[ -z "${instruction}" ]]; then
  fatal "instruction argument is required"
fi

export BUN_INSTALL="${BUN_INSTALL:-/root/.bun}"
export PATH="${BUN_INSTALL}/bin:${PATH}"

CMUX_APP_ROOT="${CMUX_APP_ROOT:-/opt/cmux-app}"
CMUX_CONFIG_ROOT="${CMUX_CONFIG_ROOT:-/root/.cmux}"
CMUX_PROJECT_PATH="${CMUX_PROJECT_PATH:-}"
CMUX_PROJECT_CANDIDATES="${CMUX_PROJECT_CANDIDATES:-/workspace:/app:/workspaces:/root/project}"
CMUX_MODEL="${CMUX_MODEL:-anthropic:claude-sonnet-4-5}"
CMUX_TIMEOUT_MS="${CMUX_TIMEOUT_MS:-}"
CMUX_TRUNK="${CMUX_TRUNK:-main}"
CMUX_WORKSPACE_ID="${CMUX_WORKSPACE_ID:-cmux-bench}"
CMUX_THINKING_LEVEL="${CMUX_THINKING_LEVEL:-high}"
CMUX_MODE="${CMUX_MODE:-exec}"

ensure_bun() {
  if ! command -v bun >/dev/null 2>&1; then
    fatal "bun must be installed before running the cmux agent"
  fi
}

resolve_project_path() {
  if [[ -n "${CMUX_PROJECT_PATH}" ]]; then
    if [[ -d "${CMUX_PROJECT_PATH}" ]]; then
      printf '%s\n' "${CMUX_PROJECT_PATH}"
      return 0
    fi
    fatal "CMUX_PROJECT_PATH=${CMUX_PROJECT_PATH} not found"
  fi

  IFS=":" read -r -a candidates <<<"${CMUX_PROJECT_CANDIDATES}"
  for candidate in "${candidates[@]}"; do
    if [[ -d "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  fatal "no project path located (searched ${CMUX_PROJECT_CANDIDATES})"
}

ensure_git_repo() {
  local project_path=$1

  if command -v git >/dev/null 2>&1; then
    if git -C "${project_path}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      # Ensure trunk branch exists even on pre-existing repos.
      if ! git -C "${project_path}" rev-parse --verify "${CMUX_TRUNK}" >/dev/null 2>&1; then
        git -C "${project_path}" checkout -b "${CMUX_TRUNK}" >/dev/null 2>&1 || true
      else
        git -C "${project_path}" checkout "${CMUX_TRUNK}" >/dev/null 2>&1 || true
      fi
      return 0
    fi

    log "initialising git repository at ${project_path}"
    if git -C "${project_path}" init --initial-branch="${CMUX_TRUNK}" >/dev/null 2>&1; then
      :
    else
      git -C "${project_path}" init >/dev/null
      git -C "${project_path}" checkout -B "${CMUX_TRUNK}" >/dev/null
    fi
    git -C "${project_path}" config user.name "cmux-bench"
    git -C "${project_path}" config user.email "bench@cmux.local"
    git -C "${project_path}" add -A >/dev/null
    git -C "${project_path}" commit -m "chore: initial snapshot" --allow-empty >/dev/null
    git -C "${project_path}" branch -M "${CMUX_TRUNK}" >/dev/null
  else
    log "git not available; skipping repository initialisation"
  fi
}

ensure_bun
project_path=$(resolve_project_path)
ensure_git_repo "${project_path}"

bun --version >/dev/null 2>&1 || fatal "bun not available after ensure_bun"

log "starting cmux agent session for ${project_path}"
cd "${CMUX_APP_ROOT}"

cmd=(bun src/debug/agentSessionCli.ts
  --config-root "${CMUX_CONFIG_ROOT}"
  --project-path "${project_path}"
  --workspace-path "${project_path}"
  --workspace-id "${CMUX_WORKSPACE_ID}"
  --model "${CMUX_MODEL}"
  --mode "${CMUX_MODE}"
  --json-streaming)

if [[ -n "${CMUX_TIMEOUT_MS}" ]]; then
  cmd+=(--timeout "${CMUX_TIMEOUT_MS}")
fi

if [[ -n "${CMUX_THINKING_LEVEL}" ]]; then
  cmd+=(--thinking-level "${CMUX_THINKING_LEVEL}")
fi

if ! printf '%s' "${instruction}" | "${cmd[@]}"; then
  fatal "cmux agent session failed"
fi

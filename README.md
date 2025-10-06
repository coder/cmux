# cmux - Coding Agent Multiplexer

[![CI](https://github.com/coder/cmux/actions/workflows/ci.yml/badge.svg)](https://github.com/coder/cmux/actions/workflows/ci.yml)
[![Build](https://github.com/coder/cmux/actions/workflows/build.yml/badge.svg)](https://github.com/coder/cmux/actions/workflows/build.yml)

A cross-platform desktop application for managing multiple coding agents.

Key features:
- Supports both OpenAI and Anthropic models with consistent interface
- Workspace isolation with git worktrees
- Much richer interface than traditional TUIs
  - E.g., ask the agent for an architecture diagram of your codebase

## Caveats

- Early stage, Alpha software
- Built artifacts for macOS and Linux only
- Majority of testing on `claude-sonnet-4-5`

## Development

See [AGENTS.md](./AGENTS.md) for development setup and guidelines.

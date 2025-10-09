# cmux - coding agent multiplexer

[![CI](https://github.com/coder/cmux/actions/workflows/ci.yml/badge.svg)](https://github.com/coder/cmux/actions/workflows/ci.yml)
[![Build](https://github.com/coder/cmux/actions/workflows/build.yml/badge.svg)](https://github.com/coder/cmux/actions/workflows/build.yml)

![cmux product screenshot](docs/img/product-hero.webp)

A cross-platform desktop application for embarassingly parallel development.

## Documentation

📚 **[Read the full documentation →](https://cmux.io)**

- [Installation](https://cmux.io/install.html)
- [Keyboard Shortcuts](https://cmux.io/keybinds.html)
- [Developer Guide](https://cmux.io/AGENTS.html)

## Quick Install

Download pre-built binaries from [GitHub Actions artifacts](https://github.com/coder/cmux/actions/workflows/build.yml):

- **macOS**: Signed and notarized DMG (separate builds for Intel/Apple Silicon)
- **Linux**: AppImage

## Development

See [AGENTS.md](./AGENTS.md) for development setup and guidelines.

### Documentation Style Guide

When writing user-facing documentation, follow these principles:

**Minimum Viable Documentation** - Write only what users need to complete their task successfully. Assume users are:

- Capable of using basic UIs without instruction
- Able to debug issues without pre-written troubleshooting
- Smart enough to apply security best practices without being told

**Delete:**

- Step-by-step UI walkthroughs for obvious interactions ("Click the button", "Enter the value", "Click Save")
- Troubleshooting sections for hypothetical problems that haven't occurred
- Best practices and security advice (users will research when needed)
- Multiple ways to do the same thing (pick one, preferably the simplest)
- Verification/testing sections

**Keep:**

- Core setup steps with technical details
- Non-obvious facts about how things work
- Actual command examples
- Brief, clear explanations

## Features

- 🔀 Git worktree integration for multi-branch workflows
- 🤖 Multiple AI permission modes (plan/edit)
- 📦 Multi-project management
- 💬 Persistent session history
- ⌨️ Keyboard-first interface
  - Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)

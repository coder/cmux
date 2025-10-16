<div align="center">

<img src="docs/img/logo.webp" alt="cmux logo" width="15%" />

# cmux - coding agent multiplexer

[![CI](https://github.com/coder/cmux/actions/workflows/ci.yml/badge.svg)](https://github.com/coder/cmux/actions/workflows/ci.yml)
[![Build](https://github.com/coder/cmux/actions/workflows/build.yml/badge.svg)](https://github.com/coder/cmux/actions/workflows/build.yml)
[![Download](https://img.shields.io/badge/Download-Releases-purple)](https://github.com/coder/cmux/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)

</div>

![cmux product screenshot](docs/img/product-hero.webp)

A cross-platform desktop application for parallel agentic development.

<details>
<summary>Why parallelize?</summary>

Here are some specific use cases we enable:

- **Contextual continuity between relevant changes**:
  - e.g. create a workspace for `code-review`, `refactor`, and `new-feature`
- **GPT-5-Pro**: use the slow but powerful GPT-5-Pro for complex issues
  - Run in the background for hours on end
  - The stream will automatically resume after restarts or intermittent connection issues. If the model completes early we will show an indicator.
- **A/B testing**: run multiple workspaces in parallel on the same problem but different approaches,
  abandon the bad ones.
- **Tangent exploration**: launch tangents in `cmux` away from main work

</details>

## Features

- Isolated workspaces with central view on git status updates
- Multi-model (`sonnet-4-*`, `gpt-5-*`, `opus-4-*`)
- Supporting UI and keybinds for efficiently managing a suite of agents
- Rich markdown outputs (mermaid diagrams, LaTeX, etc.)

`cmux` has a custom agent loop, but, we are heavily inspired by Claude Code in our
UX. You'll find familiar features like Plan/Exec mode, VIM inputs, `/compact` and new ones
like [opportunistic compaction](https://cmux.io/context-management.html) and [mode prompts](https://cmux.io/instruction-files.html#mode-prompts).

📚 **[Read the full documentation →](https://cmux.io)**

## Quick Install

> [!WARNING]  
> cmux is in a Preview state. You will encounter bugs and performance issues.
> It's still possible to be highly productive. We are using it almost exclusively for our own development.

Download pre-built binaries from [the releases page](https://github.com/coder/cmux/releases):

- **macOS**: Signed and notarized DMG (separate builds for Intel/Apple Silicon)
- **Linux**: AppImage
- **Windows**: not implemented, coming soon

## Screenshots

<div align="center">
  <p><em>Git divergence UI keeps you looped in on changes and potential conflicts:</em></p>
  <img src="./docs/img/git-status.webp" alt="Screenshot of git status" />
</div>

<div align="center">
  <p><em>Mermaid diagrams make it easier to review complex proposals from the Agent:</em></p>
  <img src="./docs/img/plan-mermaid.webp" alt="Screenshot of mermaid diagram" />
</div>

<div align="center">
  <p><em>Project secrets help split your Human and Agent identities:</em></p>
  <img src="./docs/img/project-secrets.webp" alt="Screenshot of project secrets" />
</div>

<div align="center">
  <p><em>Stay looped in on costs and token consumption:</em></p>
  <img src="./docs/img/costs-tab.webp" alt="Screenshot of costs table" />
</div>

<div align="center">
  <p><em>Opportunistic compaction helps keep context small:</em></p>
  <img src="./docs/img/opportunistic-compaction.webp" alt="Screenshot of opportunistic compaction" />
</div>

<div align="center">
  <p><em>TODO lists keep you informed on the agent's plan:</em></p>
  <img src="./docs/img/todo.webp" alt="Screenshot of todo list" />
</div>

## More reading

See [the documentation](https://cmux.io) for more details.

## Development

See [AGENTS.md](./AGENTS.md) for development setup and guidelines.

## License

Copyright (C) 2025 Coder Technologies, Inc.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, version 3 of the License.

See [LICENSE](./LICENSE) for details.

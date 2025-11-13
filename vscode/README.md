# cmux VS Code Extension

Open [cmux](https://cmux.io) workspaces from VS Code or Cursor.

## Installation

Download the latest `.vsix` from [cmux releases](https://github.com/coder/cmux/releases) and install:

```bash
code --install-extension cmux-0.1.0.vsix
```

## Usage

`Cmd+Shift+P` → "cmux: Open Workspace" → Select workspace

## Requirements

**For SSH workspaces**: Install Remote-SSH extension
- **VS Code**: `ms-vscode-remote.remote-ssh`
- **Cursor**: `anysphere.remote-ssh`

SSH hosts must be configured in `~/.ssh/config`.

## Development

```bash
cd vscode
npm install
npm run compile  # Build
npm run package  # Create .vsix
```

Press `F5` in VS Code to debug.

# cmux VS Code Extension

Open [cmux](https://cmux.io) workspaces from VS Code or Cursor.

## Installation

**From VS Code Marketplace:**

```bash
code --install-extension coder.cmux
```

Or search "cmux" in VS Code Extensions panel.

**From .vsix file:**

Download the latest `.vsix` from [cmux releases](https://github.com/coder/cmux/releases):

```bash
code --install-extension cmux-<version>.vsix
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

# VS Code Extension

The cmux VS Code extension allows you to quickly jump into your cmux workspaces directly from Visual Studio Code or Cursor.

## Overview

Instead of switching between cmux and your editor, you can open any cmux workspace from the Command Palette:

1. Press `Cmd+Shift+P` (or `Ctrl+Shift+P` on Windows/Linux)
2. Type "cmux: Open Workspace"
3. Select your workspace
4. It opens in a new editor window

The extension works seamlessly with both local and SSH workspaces. It's compatible with VS Code and Cursor (or any VS Code-based editor).

## Installation

### Download

Download the latest `.vsix` file from the [GitHub releases page](https://github.com/coder/cmux/releases).

### Install

**Command line:**
```bash
# For VS Code
code --install-extension cmux-0.1.0.vsix

# For Cursor
cursor --install-extension cmux-0.1.0.vsix
```

**From editor UI:**
1. Open Command Palette (`Cmd+Shift+P`)
2. Type "Extensions: Install from VSIX..."
3. Select the downloaded file

## Usage

### Opening a Workspace

**Command Palette**:
1. Press `Cmd+Shift+P` → "cmux: Open Workspace"
2. Select from list: Choose your workspace
3. Opens automatically: New editor window with the workspace

**Custom Keyboard Shortcut** (optional):
- Open Keyboard Shortcuts settings (`Cmd+K Cmd+S`)
- Search for "cmux: Open Workspace"
- Set your preferred keybinding (suggestions: `Cmd+K Cmd+M` or `Cmd+O Cmd+M`)

### Workspace Types

The extension displays workspaces differently based on their type:

- **Local**: `📁 [project-name] workspace-name`
- **SSH**: `🔗 [project-name] workspace-name (ssh: hostname)`

## SSH Workspaces

### Requirements

For SSH workspaces to work, you need:

1. **Remote-SSH Extension** installed
   - VS Code: `ms-vscode-remote.remote-ssh`
   - Cursor: `anysphere.remote-ssh`
   - The extension automatically detects which one you have
2. **SSH host configured** in `~/.ssh/config` or in the Remote-SSH extension

### Setup SSH Host

If you haven't configured the SSH host yet:

1. Open `~/.ssh/config` and add:
   ```ssh
   Host myserver
     HostName 192.168.1.100
     User username
     IdentityFile ~/.ssh/id_rsa
   ```

2. Or use VS Code's Remote-SSH command:
   - `Cmd+Shift+P` → "Remote-SSH: Add New SSH Host..."

### Troubleshooting SSH

If opening an SSH workspace fails:

1. **Verify host is configured**: Check `~/.ssh/config`
2. **Test connection**: Run `ssh <hostname>` in terminal
3. **Check Remote-SSH**: Ensure the extension is installed and working
4. **Match host names**: The host in cmux must match the one in SSH config

## How It Works

The extension:

1. Reads `~/.cmux/config.json` to get all workspaces
2. Displays them in a QuickPick menu
3. Opens local workspaces using `file://` URIs
4. Opens SSH workspaces using `vscode-remote://` URIs (via Remote-SSH)

The extension delegates SSH connection handling to VS Code's Remote-SSH extension, so it works the same way as manually opening remote folders.

## When to Use

This extension is ideal when:

- You primarily work in VS Code
- You want quick access to cmux workspaces without switching apps
- You're jumping between multiple workspaces frequently
- You have both local and SSH workspaces

## Comparison with cmux

| Feature | cmux App | VS Code Extension |
|---------|----------|-------------------|
| Create workspaces | ✅ | ❌ (read-only) |
| Open workspaces | ✅ | ✅ |
| View git status | ✅ | ❌ |
| AI chat interface | ✅ | ❌ |
| Manage workspace lifecycle | ✅ | ❌ |
| Quick access from VS Code | ❌ | ✅ |

The extension is designed to **complement** the cmux app, not replace it. Use cmux for workspace management and the extension for quick access from VS Code.

## Development

See the [extension README](../vscode/README.md) for development instructions.

## Related

- [Workspaces Overview](./workspaces.md)
- [SSH Workspaces](./ssh.md)
- [VS Code Remote-SSH Documentation](https://code.visualstudio.com/docs/remote/ssh)

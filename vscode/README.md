# cmux VS Code Extension

Quickly jump into your [cmux](https://cmux.io) workspaces directly from Visual Studio Code or Cursor.

## Features

- **Command Palette Integration**: Access your cmux workspaces with `Cmd+Shift+P` → "cmux: Open Workspace"
- **Local Workspaces**: Opens local cmux workspaces in a new VS Code window
- **SSH Workspaces**: Opens remote SSH workspaces using VS Code's Remote-SSH extension
- **Smart Display**: Shows workspace names with project context and runtime information

## Installation

### From VSIX File

1. Download the latest `.vsix` file from the [cmux releases](https://github.com/coder/cmux/releases)
2. Install using the command line:
   ```bash
   # For VS Code
   code --install-extension cmux-0.1.0.vsix
   
   # For Cursor
   cursor --install-extension cmux-0.1.0.vsix
   ```
3. Or install from the editor UI:
   - Open VS Code or Cursor
   - Press `Cmd+Shift+P` (or `Ctrl+Shift+P` on Windows/Linux)
   - Type "Extensions: Install from VSIX..."
   - Select the downloaded `.vsix` file

## Usage

1. **Open Command Palette**: Press `Cmd+Shift+P` (or `Ctrl+Shift+P` on Windows/Linux)
2. **Run Command**: Type "cmux: Open Workspace" and press Enter
3. **Select Workspace**: Choose from the list of your cmux workspaces
4. **Opens in New Window**: The workspace opens in a new editor window

### Custom Keyboard Shortcut (Optional)

You can set your own keyboard shortcut:

1. Open Keyboard Shortcuts: `Cmd+K Cmd+S` (or `Ctrl+K Ctrl+S`)
2. Search for "cmux: Open Workspace"
3. Click the `+` icon and set your preferred keybinding

Suggested keybindings:
- `Cmd+K Cmd+M` / `Ctrl+K Ctrl+M` (M for cMux)
- `Cmd+O Cmd+M` / `Ctrl+O Ctrl+M` (O for Open)

### Workspace Display Format

- **Local workspaces**: `📁 [project-name] workspace-name`
- **SSH workspaces**: `🔗 [project-name] workspace-name (ssh: hostname)`

## Requirements

### For SSH Workspaces

To open SSH workspaces, you need:

1. **Remote-SSH Extension**: Install from the marketplace
   - **VS Code**: `ext install ms-vscode-remote.remote-ssh`
   - **Cursor**: `ext install anysphere.remote-ssh`
   
   The extension will automatically detect which one you have installed.

2. **SSH Configuration**: The SSH host must be configured in one of:
   - Your `~/.ssh/config` file
   - The Remote-SSH extension settings

### Example SSH Config

Add to `~/.ssh/config`:

```ssh
Host myserver
  HostName 192.168.1.100
  User username
  IdentityFile ~/.ssh/id_rsa
```

## How It Works

The extension reads your cmux configuration from `~/.cmux/config.json` and:

1. **Lists all workspaces** from all projects
2. **Identifies workspace type** (local vs SSH)
3. **Opens local workspaces** using file:// URIs
4. **Opens SSH workspaces** using vscode-remote:// URIs (via Remote-SSH)

## Troubleshooting

### "No cmux workspaces found"

**Solution**: Create at least one workspace in the cmux application first.

### "Remote - SSH extension is required"

**Solution**: Install the Remote-SSH extension:
1. Open Extensions: `Cmd+Shift+X` (or `Ctrl+Shift+X`)
2. Search for "Remote - SSH"
3. Install the extension by Microsoft

### "Failed to open SSH workspace"

**Solution**: Ensure the SSH host is configured:
1. Check your `~/.ssh/config` file
2. Or use Remote-SSH command: `Cmd+Shift+P` → "Remote-SSH: Add New SSH Host..."
3. Test SSH connection in terminal: `ssh <hostname>`

### "Workspace path not found"

**Solution**: The workspace may have been deleted or moved. Recreate it in cmux.

## Related Links

- [cmux Documentation](https://cmux.io)
- [cmux GitHub Repository](https://github.com/coder/cmux)
- [VS Code Remote-SSH Documentation](https://code.visualstudio.com/docs/remote/ssh)

## Development

### Building from Source

```bash
cd vscode
npm install
npm run compile
```

### Packaging

```bash
npm run package
```

This creates a `.vsix` file in the `vscode` directory.

### Testing

1. Open the `vscode` folder in VS Code
2. Press `F5` to launch Extension Development Host
3. In the new window, press `Cmd+Shift+P`
4. Run "cmux: Open Workspace"

## License

AGPL-3.0-only - See [LICENSE](../LICENSE) in the main repository.

## Contributing

This extension is part of the [cmux](https://github.com/coder/cmux) project. Contributions are welcome!

---

_Generated with cmux_ 🤖

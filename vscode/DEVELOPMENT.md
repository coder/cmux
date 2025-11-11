# VS Code Extension Development

## Quick Start

### Build the Extension

From the repository root:

```bash
make vscode-ext
```

Or from the `vscode/` directory:

```bash
npm install
npm run compile
npm run package
```

This creates `cmux-0.1.0.vsix` in the `vscode/` directory.

### Install Locally

```bash
make vscode-ext-install
```

Or manually:

```bash
code --install-extension vscode/cmux-0.1.0.vsix
```

Then reload VS Code.

### Testing

1. Open the `vscode/` folder in VS Code
2. Press `F5` to launch Extension Development Host
3. In the new window:
   - Press `Cmd+Shift+P`
   - Type "cmux: Open Workspace"
   - Test the extension

### Watch Mode

For development with hot reload:

```bash
cd vscode
npm run watch
```

Then press `F5` in VS Code. Changes will recompile automatically.

## Project Structure

```
vscode/
├── src/
│   ├── extension.ts         # Main entry point, command registration
│   ├── cmuxConfig.ts         # Read ~/.cmux/config.json
│   └── workspaceOpener.ts    # Open local/SSH workspaces
├── out/                      # Compiled JavaScript (git ignored)
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript configuration
├── README.md                 # User-facing documentation
└── CHANGELOG.md              # Version history
```

## Key Files

### extension.ts

- Registers the `cmux.openWorkspace` command
- Shows QuickPick with workspace list
- Delegates to `workspaceOpener`

### cmuxConfig.ts

- Reads `~/.cmux/config.json`
- Parses workspace metadata
- Computes workspace paths (local and SSH)

### workspaceOpener.ts

- Opens local workspaces via `vscode.Uri.file()`
- Opens SSH workspaces via `vscode-remote://` URI
- Handles Remote-SSH extension checks
- Shows helpful error messages

## Adding Features

### New Command

1. Add command to `package.json` under `contributes.commands`
2. Register in `extension.ts` using `vscode.commands.registerCommand`
3. Add to activation events if needed

### New Configuration

1. Add to `package.json` under `contributes.configuration`
2. Read using `vscode.workspace.getConfiguration('cmux')`

## Publishing

### Build for Release

```bash
npm run package
```

### Publish to Marketplace

1. Get a Personal Access Token from Azure DevOps
2. Install vsce: `npm install -g @vscode/vsce`
3. Create publisher: `vsce create-publisher coder`
4. Publish: `vsce publish`

For now, we're distributing via GitHub releases as `.vsix` files.

## Testing with Real Config

The extension reads from `~/.cmux/config.json`. To test:

1. Ensure you have cmux installed and workspaces created
2. Run the extension (F5)
3. Execute "cmux: Open Workspace"
4. Should show your actual workspaces

## Debugging

- **Set breakpoints** in `.ts` files
- **Launch with F5** to hit breakpoints
- **Console output** appears in Debug Console
- **Extension logs** in Extension Host output channel

## Common Issues

### "Module not found" errors

Run `npm install` in the `vscode/` directory.

### TypeScript errors

Check `tsconfig.json` and ensure all types are installed:

```bash
npm install --save-dev @types/node @types/vscode
```

### Extension not loading

1. Check `package.json` has correct `main` field: `"./out/extension.js"`
2. Ensure `npm run compile` succeeded
3. Check Extension Host output for errors

## Code Style

Follow the same TypeScript patterns as the main cmux codebase:

- Use strict TypeScript
- Avoid `any` types
- Use proper error handling
- Document exported functions
- Keep functions focused and testable

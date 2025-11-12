# Native Node.js Modules in Electron

## Problem

Native Node.js modules (like `better-sqlite3`) contain compiled C/C++ code that must match the exact Node.js version being used. Electron bundles its own version of Node.js, which is different from your system Node.js.

When you run `bun install` or `npm install`, native modules are compiled against your **system Node.js**. However, when Electron runs, it uses its **own Node.js version**, causing module version mismatches:

```
Error: The module was compiled against a different Node.js version using
NODE_MODULE_VERSION 115. This version of Node.js requires
NODE_MODULE_VERSION 139.
```

## Solution

We use `@electron/rebuild` to recompile native modules for Electron's Node.js version.

### Automatic Rebuild

The build system automatically rebuilds native modules:

```bash
make build          # Rebuilds as part of the build process
bun install         # Triggers postinstall hook that rebuilds
```

### Manual Rebuild

If you encounter module version errors:

```bash
make rebuild        # Rebuild all native modules
# or
bun run rebuild     # Same thing
```

### Adding New Native Modules

When adding a new native module dependency:

1. Add it to `package.json`:

   ```bash
   bun add <package-name>
   ```

2. Update the rebuild script if needed:

   ```json
   {
     "scripts": {
       "rebuild": "electron-rebuild -f -w better-sqlite3,<new-module>"
     }
   }
   ```

3. The postinstall hook will automatically rebuild it

## Current Native Modules

- `better-sqlite3` - SQLite database for metadata store

## How It Works

1. **postinstall hook**: Runs after `bun install` completes
2. **electron-rebuild**: Recompiles native modules using Electron's headers
3. **Force rebuild (-f)**: Always recompiles, even if already built
4. **Whitelist (-w)**: Only rebuilds specified modules (faster)

## Build System Integration

```makefile
# Makefile ensures native modules are rebuilt
node_modules/.installed: package.json bun.lock
    @bun install
    @bun run rebuild  # ← Rebuilds native modules
    @touch node_modules/.installed
```

This ensures:

- ✅ Native modules are always compiled for the correct Electron version
- ✅ New developers don't hit module version errors
- ✅ CI builds work consistently
- ✅ Works across different platforms (macOS, Linux, Windows)

## Troubleshooting

### Error: Module was compiled against different Node.js version

**Solution**: Run `make rebuild` or `bun run rebuild`

### Rebuild fails on CI

**Cause**: Missing build tools (C++ compiler, Python)

**Solution**: Ensure CI has build dependencies:

- macOS: Xcode Command Line Tools
- Linux: `build-essential`, `python3`
- Windows: Visual Studio Build Tools

### Slow rebuilds

**Cause**: Rebuilding all modules

**Solution**: Use whitelist in `rebuild` script to only rebuild native modules:

```json
"rebuild": "electron-rebuild -f -w better-sqlite3"
```

## References

- [Electron Native Modules Docs](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [@electron/rebuild](https://github.com/electron/rebuild)

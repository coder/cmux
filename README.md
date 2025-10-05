# cmux - Coding Agent Multiplexer

A cross-platform desktop application for managing multiple coding agents.

## Build Status

[![CI](https://github.com/coder/cmux/actions/workflows/ci.yml/badge.svg)](https://github.com/coder/cmux/actions/workflows/ci.yml)
[![Build](https://github.com/coder/cmux/actions/workflows/build.yml/badge.svg)](https://github.com/coder/cmux/actions/workflows/build.yml)

## Downloads

### Development Builds

Pre-built binaries are available from [GitHub Actions](https://github.com/coder/cmux/actions/workflows/build.yml):

- **macOS**: Universal binary DMG (Intel + Apple Silicon)
- **Linux**: AppImage (portable, works on most distros)

To download:

1. Go to the [Build workflow](https://github.com/coder/cmux/actions/workflows/build.yml)
2. Click on the latest successful run
3. Scroll down to "Artifacts" section
4. Download `macos-dmg` or `linux-appimage`

### Installation

**macOS:**

⚠️ **Note**: The app is unsigned, so you'll need to bypass Gatekeeper security.

1. Download and open the DMG file
2. Drag Cmux to Applications folder
3. **First time opening**:
   - Don't double-click the app (macOS will block it)
   - Right-click (or Control+click) on Cmux.app
   - Select "Open" from the menu
   - Click "Open" in the security dialog
   - The app will now be allowed to run

**Alternative method if the above doesn't work:**

1. After step 2, open Terminal
2. Run: `xattr -cr /Applications/Cmux.app`
3. Run: `codesign --force --deep --sign - /Applications/Cmux.app`
4. Now you can open the app normally

These steps are only needed once. After that, you can open the app normally.

**Linux:**

1. Download the AppImage file
2. Make it executable: `chmod +x Cmux-*.AppImage`
3. Run it: `./Cmux-*.AppImage`

## Development

See [CLAUDE.md](CLAUDE.md) for development setup and guidelines.

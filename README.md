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
1. Download and open the DMG file
2. Drag Cmux to Applications folder
3. Right-click and select "Open" (first time only, since the app is unsigned)

**Linux:**
1. Download the AppImage file
2. Make it executable: `chmod +x Cmux-*.AppImage`
3. Run it: `./Cmux-*.AppImage`

## Development

See [CLAUDE.md](CLAUDE.md) for development setup and guidelines.

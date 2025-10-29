# Install

## Downloads

### Release Builds

Download pre-built binaries from [the releases page](https://github.com/coder/cmux/releases):

- **macOS**: Signed and notarized DMG (separate builds for Intel/Apple Silicon)
- **Linux**: AppImage

### Development Builds

Down pre-built binaries of `main` from [GitHub Actions](https://github.com/coder/cmux/actions/workflows/build.yml):

- **macOS**: Signed and notarized DMG
  - `macos-dmg-x64` (Intel Macs)
  - `macos-dmg-arm64` (Apple Silicon)
- **Linux**: AppImage (portable, works on most distros)

To download:

1. Go to the [Build workflow](https://github.com/coder/cmux/actions/workflows/build.yml?query=event:merge_group)
2. Click on the latest successful run
3. Scroll down to "Artifacts" section
4. Download the appropriate artifact for your platform

### Installation

**macOS:**

1. Download the DMG file for your Mac:
   - Intel Mac: `macos-dmg-x64`
   - Apple Silicon: `macos-dmg-arm64`
2. Open the DMG file
3. Drag Cmux to Applications folder
4. Open the app normally

The app is code-signed and notarized by Apple, so it will open without security warnings.

**Linux:**

1. Download the AppImage file
2. Make it executable: `chmod +x Cmux-*.AppImage`
3. Run it: `./Cmux-*.AppImage`

### Testing Pre-Release Builds

⚠️ **Note**: Only builds from the `main` branch are signed and notarized. If you're testing a build from a pull request or other branch, you'll need to bypass macOS Gatekeeper:

1. After installing, open Terminal
2. Run: `xattr -cr /Applications/Cmux.app`
3. Run: `codesign --force --deep --sign - /Applications/Cmux.app`
4. Now you can open the app normally

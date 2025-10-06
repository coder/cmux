# Build Artifacts Documentation

## Artifact Structure

Each build creates separate artifacts for each platform and architecture:

### macOS
- **macos-arm64-dmg**: DMG installer for Apple Silicon (M1/M2/M3)
- **macos-x64-dmg**: DMG installer for Intel Macs

### Linux
- **linux-appimage**: AppImage for Linux x64

## Downloading Artifacts

1. Go to the Actions tab in GitHub
2. Click on a completed workflow run
3. Scroll to "Artifacts" section
4. Download the appropriate artifact for your platform

## Installation

### macOS
1. Download the appropriate DMG for your architecture
2. Open the DMG file
3. Drag Cmux.app to Applications folder
4. Right-click and select "Open" (first time only, due to Gatekeeper)

### Linux
1. Download the AppImage
2. Make it executable: `chmod +x Cmux-*.AppImage`
3. Run: `./Cmux-*.AppImage`

## Build Size Comparison

After optimization, expected sizes:
- macOS ARM64 DMG: ~150-200 MB (down from ~300-400 MB)
- macOS x64 DMG: ~150-200 MB (down from ~300-400 MB)
- Linux AppImage: ~200-250 MB

Note: Actual sizes depend on dependencies and app complexity.

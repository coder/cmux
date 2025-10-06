# Bundle Size Optimization Guide

This document describes the optimizations made to reduce the Electron app bundle size and split artifacts per platform.

## Changes Made

### 1. Split Artifacts Per Platform

**Problem:** Previously, the macOS build created both x64 and arm64 DMGs in a single build job, then uploaded them as one artifact. This created large, monolithic artifacts.

**Solution:** Split the macOS build into two separate jobs:
- `build-macos-arm64`: Builds only ARM64 (Apple Silicon) DMG
- `build-macos-x64`: Builds only x64 (Intel) DMG

**Benefits:**
- Smaller, more focused artifacts
- Parallel builds (faster CI)
- Users download only what they need
- Clearer artifact naming

### 2. Electron Builder Optimizations

**package.json build configuration:**

```json
{
  "files": [
    "dist/**/*",
    "!dist/**/*.map",        // Exclude sourcemaps
    "!**/node_modules/**/*"  // Exclude unnecessary node_modules
  ],
  "asarUnpack": [
    "**/node_modules/@dqbd/tiktoken/**/*"  // Unpack native modules
  ],
  "compression": "maximum",          // Maximum compression
  "removePackageScripts": true,      // Remove package.json scripts
  "nodeGypRebuild": false           // Skip native module rebuild
}
```

**Key optimizations:**
- ✅ Exclude source maps (saves ~30-40% on bundled JS size)
- ✅ Maximum compression
- ✅ Remove unnecessary package.json scripts
- ✅ Skip node-gyp rebuild (faster builds, smaller output)
- ✅ Unpack native modules that need filesystem access

### 3. Vite Build Optimizations

**vite.config.ts changes:**

```typescript
{
  sourcemap: false,              // Disable sourcemaps in production
  minify: "terser",             // Use terser for better minification
  terser: {
    compress: {
      drop_console: true,      // Remove console.log statements
      drop_debugger: true,     // Remove debugger statements
    },
  },
  rollupOptions: {
    output: {
      manualChunks: {          // Code splitting for better caching
        react: ["react", "react-dom"],
        markdown: ["react-markdown", "remark-gfm", "remark-math", "rehype-katex"],
        syntax: ["react-syntax-highlighter"],
        mermaid: ["mermaid"],
      },
    },
  },
}
```

**Key optimizations:**
- ✅ Terser minification (better than esbuild for size)
- ✅ Drop console.log statements in production
- ✅ Code splitting for vendor libraries
- ✅ No sourcemaps in production builds

## Expected Impact

### Size Reductions
- **Source maps removal**: ~30-40% reduction in JS bundle size
- **Terser minification**: ~10-15% additional reduction vs esbuild
- **Maximum compression**: ~5-10% reduction in final DMG/installer
- **Console.log removal**: ~1-3% reduction in JS bundle

### Build Time Impact
- **Split artifacts**: Builds can run in parallel (faster overall)
- **No source maps**: Faster builds (~20-30% faster)
- **Per-platform builds**: Each job is faster (50% less work per job)

## Testing the Optimizations

### Local Build Test
```bash
# Build and check size
bun run build
du -sh dist/

# Build macOS ARM64 DMG
bun run dist:mac:arm64
ls -lh release/

# Build macOS x64 DMG
bun run dist:mac:x64
ls -lh release/
```

### Analyzing Bundle Size
```bash
# Build with analysis
bun run build
# Check dist/ directory size
du -sh dist/
du -h dist/ | sort -h | tail -20

# Check what's in the DMG
hdiutil attach release/Cmux-*.dmg
du -sh /Volumes/Cmux/Cmux.app
hdiutil detach /Volumes/Cmux
```

## Build Scripts

New scripts added to package.json:
- `dist:mac:arm64` - Build macOS ARM64 only
- `dist:mac:x64` - Build macOS x64 only
- `dist:mac` - Build both architectures (original behavior)

## CI/CD Changes

**Before:**
- One job: `build-macos`
- Built both architectures
- One artifact: `macos-dmg`

**After:**
- Two jobs: `build-macos-arm64`, `build-macos-x64`
- Each builds one architecture
- Two artifacts: `macos-arm64-dmg`, `macos-x64-dmg`

## Further Optimization Ideas

If more size reduction is needed:

1. **Tree-shake dependencies**: Use `import { specific } from 'library'` instead of `import * as lib`
2. **Lazy load components**: Use React.lazy() for large components
3. **Remove unused dependencies**: Audit with `bun x depcheck`
4. **Optimize images**: Compress icons and assets
5. **Use asar unpacking selectively**: Only unpack what's necessary
6. **Consider esbuild for main process**: It's faster and often smaller for Node.js code

## Measuring Success

Track these metrics before and after:
- DMG file size (MB)
- dist/ directory size (MB)
- CI build time (minutes)
- Download size per user (MB)
- Installation time (seconds)

## Rollback

If issues arise, revert to previous behavior:

```bash
git revert <commit-hash>
```

Or manually:
1. Restore `build.yml` to single `build-macos` job
2. Remove terser config from `vite.config.ts`
3. Set `sourcemap: true` in `vite.config.ts`
4. Remove compression settings from `package.json`

# Documentation Theme Source

This directory contains TypeScript source files for custom mdBook theme enhancements.

## Files

- `code-blocks.ts` - Enhances code blocks with Shiki syntax highlighting and line numbers
- `tsconfig.json` - TypeScript configuration for theme assets

## Building

The TypeScript files are compiled to JavaScript using bun and output to `../theme/`:

```bash
# Build theme assets
make docs-theme

# Or manually
cd docs/theme-src
bun build code-blocks.ts --outfile=../theme/code-blocks.js --target=browser --minify
```

## Integration

The compiled JavaScript is automatically built before documentation builds:

- `make docs-build` - Builds theme, then builds docs
- `make docs-watch` - Builds theme, then watches docs
- `make docs` - Builds theme, then serves docs

## Features

### Code Block Enhancement

Transforms mdBook's default code blocks to match cmux app styling:

- **Shiki syntax highlighting** with `min-dark` theme
- **Line numbers** in CSS grid layout
- **Copy button** with hover interaction
- **CDN loading** of Shiki (via `theme/head.hbs`)

### Architecture

1. `theme/head.hbs` loads Shiki from CDN as ES module
2. `code-blocks.js` waits for Shiki to load
3. Finds all `<pre><code class="language-*">` elements
4. Highlights with Shiki, builds new DOM with line numbers
5. Replaces original code blocks with enhanced version

### Styling

CSS for code blocks is in `theme/custom.css`:

- `.code-block-wrapper` - Container with position for copy button
- `.code-block-container` - CSS grid with line numbers
- `.line-number` - Left column with line numbers
- `.code-line` - Right column with syntax-highlighted code
- `.copy-button` - Copy button with hover effects

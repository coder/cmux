# Extension Test Fixtures

These are real extension files used in integration tests. They demonstrate the extension API and serve as examples for extension developers.

## Structure

- `simple-logger.js` - Single-file extension that logs tool executions
- `folder-extension/` - Folder-based extension with manifest.json
- `broken-extension.js` - Extension that throws errors (for error handling tests)
- `working-extension.js` - Extension that works correctly (paired with broken-extension)
- `minimal-extension.js` - Minimal extension for basic functionality tests

## Type Safety

All extensions use JSDoc to import TypeScript types from the cmux repo:

```javascript
/** @typedef {import('../../../src/types/extensions').Extension} Extension */
/** @typedef {import('../../../src/types/extensions').PostToolUseContext} PostToolUseContext */

/** @type {Extension} */
const extension = {
  async onPostToolUse(context) {
    // Type-safe access to context
    const { toolName, runtime } = context;
  }
};
```

This provides IDE autocomplete, type checking, and inline documentation.

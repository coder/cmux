# Extension Test Fixtures

This directory contains test extensions for the cmux extension system.

## Fixtures

### TypeScript Extensions (Recommended)

- **`typescript-logger.ts`** - Demonstrates full TypeScript type imports and type safety
- **`simple-logger.ts`** - Logs all tool executions to `.cmux/extension-log.txt`
- **`broken-extension.ts`** - Intentionally throws errors (tests error handling)
- **`working-extension.ts`** - Works correctly (tests resilience when other extensions fail)
- **`folder-extension/`** - Folder-based extension with `manifest.json` → `index.ts`

### JavaScript Extension (Compatibility Test)

- **`minimal-extension.js`** - Minimal JavaScript extension using JSDoc types (ensures .js still works)

## Usage in Tests

These fixtures are used by:
- Unit tests: `src/utils/extensions/discovery.test.ts`
- Integration tests: `tests/extensions/extensions.test.ts`

## Writing Extensions

For real-world usage, TypeScript is recommended:

```typescript
import type { Extension, PostToolUseHookPayload } from "@coder/cmux/ext";

const extension: Extension = {
  async onPostToolUse(payload: PostToolUseHookPayload) {
    const { toolName, runtime } = payload;
    await runtime.writeFile(".cmux/log.txt", `Tool: ${toolName}\n`);
  }
};

export default extension;
```

JavaScript with JSDoc also works:

```javascript
/** @typedef {import('@coder/cmux/ext').Extension} Extension */
/** @typedef {import('@coder/cmux/ext').PostToolUseHookPayload} PostToolUseHookPayload */

/** @type {Extension} */
const extension = {
  /** @param {PostToolUseHookPayload} payload */
  async onPostToolUse(payload) {
    const { toolName, runtime } = payload;
    await runtime.writeFile(".cmux/log.txt", `Tool: ${toolName}\n`);
  }
};

export default extension;
```

## Type Safety

All fixtures demonstrate:
- ✅ Proper type imports from `@coder/cmux/ext`
- ✅ Full IDE autocomplete and type checking
- ✅ Runtime type safety (TypeScript fixtures compiled automatically)
- ✅ Source maps for debugging

# CLAUDE.md - Project Notes for AI Assistants

## Project Context

- Electron + React desktop application
- No existing users - migration code is not needed when changing data structures

## AI-Generated Content Attribution

When creating public operations (commits, PRs, issues), always include:

- 🤖 emoji in the title
- "_Generated with `cmux`_" in the body (if applicable)

This ensures transparency about AI-generated contributions.

## PR Management

After submitting or updating PRs, **always check merge status**:

```bash
gh pr view <number> --json mergeable,mergeStateStatus | jq '.'
```

This is especially important with rapid development where branches quickly fall behind.

**Key status values:**
- `mergeable: "MERGEABLE"` = No conflicts, can merge
- `mergeable: "CONFLICTING"` = Has conflicts, needs resolution
- `mergeStateStatus: "CLEAN"` = Ready to merge ✅
- `mergeStateStatus: "BLOCKED"` = Waiting for CI checks
- `mergeStateStatus: "BEHIND"` = Branch is behind base, rebase needed
- `mergeStateStatus: "DIRTY"` = Has conflicts

**If branch is behind:**
```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

## Project Structure

- `src/main.ts` - Main Electron process
- `src/preload.ts` - Preload script for IPC
- `src/App.tsx` - Main React component
- `src/config.ts` - Configuration management
- `~/.cmux/config.json` - User configuration file
- `~/.cmux/src/<project_name>/<branch>` - Workspace directories for git worktrees
- `~/.cmux/sessions/<workspace_id>/chat.jsonl` - Session chat histories

## Docs

DO NOT visit https://sdk.vercel.ai/docs/ai-sdk-core. All of that content is already
in `./docs/vercel/**.mdx`.

(Generate them with `./scripts/update_vercel_docs.sh` if they don't exist.)

## Key Features

- Projects sidebar (left panel)
- Workspaces using git worktrees
- Configuration persisted to `~/.cmux/config.json`

## Package Manager

- **Using bun** - All dependencies are managed with bun (not npm)
- Use bun over npm whenever possible, including to:
  - Install dependencies: `bun install`
  - Add packages: `bun add <package>`
  - Run scripts: `bun run <script>`
  - etc.

## Development Commands

- `bun dev` - Start development server (Vite + TypeScript watcher)
- `bun start` - Start Electron app
- `bun build` - Build the application
- `bun lint` - Run ESLint & typecheck (also: `bun lint:fix`)
- `bun fmt` - Format all source files with Prettier
- `bun fmt:check` - Check if files are formatted correctly

## Refactoring

- When refactoring, use `git mv` to preserve file history instead of rewriting files from scratch

## Testing

- Always run `bun typecheck` and `bun typecheck:main` after making changes to verify types
- **Unit tests should be colocated with their business logic** - Place unit test files (\*.test.ts) in the same directory as the code they test (e.g., `aiService.test.ts` next to `aiService.ts`)
- E2E and integration tests may live in `./tests/` directory, but unit tests must be colocated
- Strive to decompose complex logic away from the components and into `.src/utils/`
  - utils should be either pure functions or easily isolated (e.g. if they operate on the FS they accept
    a path). Testing them should not require complex mocks or setup.
- **Integration tests:**
  - Run specific integration test: `TEST_INTEGRATION=1 bun x jest tests/ipcMain/sendMessage.test.ts -t "test name pattern"`
  - Run all integration tests: `TEST_INTEGRATION=1 bun x jest tests` (~35 seconds, runs 40 tests)
  - **Performance**: Tests use `test.concurrent()` to run in parallel within each file
  - **NEVER bypass IPC in integration tests** - Integration tests must use the real IPC communication paths (e.g., `mockIpcRenderer.invoke()`) even when it's harder. Directly accessing services (HistoryService, PartialService, etc.) or manipulating config/state directly bypasses the integration layer and defeats the purpose of the test.

  **Examples of bypassing IPC (DON'T DO THIS):**

  ```typescript
  // ❌ BAD - Directly manipulating config
  const config = env.config.loadConfigOrDefault();
  config.projects.set(projectPath, { path: projectPath, workspaces: [] });
  env.config.saveConfig(config);

  // ❌ BAD - Directly accessing services
  const history = await env.historyService.getHistory(workspaceId);
  await env.historyService.appendToHistory(workspaceId, message);
  ```

  **Correct approach (DO THIS):**

  ```typescript
  // ✅ GOOD - Use IPC to save config
  await env.mockIpcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, {
    projects: Array.from(projectsConfig.projects.entries()),
  });

  // ✅ GOOD - Use IPC to interact with services
  await env.mockIpcRenderer.invoke(IPC_CHANNELS.HISTORY_GET, workspaceId);
  await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, projectPath, branchName);
  ```

  **Acceptable exceptions:**
  - Reading context (like `env.config.loadConfigOrDefault()`) to prepare IPC call parameters
  - Verifying filesystem state (like checking if files exist) after IPC operations complete
  - Loading existing data to avoid expensive API calls in test setup

  If IPC is hard to test, fix the test infrastructure or IPC layer, don't work around it by bypassing IPC.

## Styling

- Colors are centralized as CSS variables in `src/styles/colors.tsx`
- Use CSS variables (e.g., `var(--color-plan-mode)`) instead of hardcoded colors
- Fonts are centralized as CSS variables in `src/styles/fonts.tsx`

## TypeScript Best Practices

- **Avoid `as any` in all contexts** - Never use `as any` casts. Instead:
  - Use proper type narrowing with discriminated unions
  - Leverage TypeScript's type guards and the compiler's type checking
  - Import and reuse existing types from dependencies rather than creating anonymous clones
  - If a type is truly complex, create a proper type definition or interface

- **Use `Record<EnumType, ValueType>` for exhaustive mappings** - When mapping enum values to strings, colors, or other values, use `Record` types instead of switch statements or if/else chains. This ensures TypeScript catches missing or invalid cases at compile time.

  ```typescript
  // ✅ Good - TypeScript ensures all modes are handled
  const MODE_COLORS: Record<UIPermissionMode, string> = {
    plan: "var(--color-plan-mode)",
    edit: "var(--color-edit-mode)",
    yolo: "var(--color-yolo-mode)",
  };

  // ❌ Avoid - Can miss cases, typos won't be caught
  switch (mode) {
    case "plan":
      return "blue";
    case "edits":
      return "green"; // Typo won't be caught!
  }
  ```

- **Leverage TypeScript's utility types for UI-specific data** - Use `Omit`, `Pick`, and other utility types to create UI-specific versions of backend types. This prevents unnecessary re-renders and clearly separates concerns.

  ```typescript
  // Backend type with all fields
  export interface WorkspaceMetadata {
    id: string;
    projectName: string;
    permissionMode: UIPermissionMode;
    nextSequenceNumber: number; // Backend bookkeeping
  }

  // UI type excludes backend-only fields
  export type WorkspaceMetadataUI = Omit<WorkspaceMetadata, "nextSequenceNumber">;
  ```

  This pattern ensures:
  - UI components don't re-render on backend-only changes
  - Clear separation between UI and backend concerns
  - Type safety - compiler catches if you try to access excluded fields
  - Self-documenting code - types clearly show what data UI needs

- **Prefer type-driven development** - Let TypeScript guide your architecture. When types become complex or you need many runtime checks, it often indicates a design issue. Simplify by:
  - Creating focused types for specific contexts (UI vs backend)
  - Using discriminated unions for state variations
  - Leveraging the compiler to catch errors at build time

- **Use `using` for leakable system resources** - Always use explicit resource management (`using` declarations) for resources that need cleanup such as child processes, file handles, database connections, etc. This ensures proper cleanup even when errors occur.

  ```typescript
  // ✅ Good - Process is automatically cleaned up
  using process = createDisposableProcess(spawn("command"));
  const output = await readFromProcess(process);
  // process.kill() called automatically when going out of scope

  // ❌ Avoid - Process may leak if error occurs before cleanup
  const process = spawn("command");
  const output = await readFromProcess(process);
  process.kill(); // May never be reached if error thrown
  ```

- This pattern maximizes type safety and prevents runtime errors from typos or missing cases

## Module Imports

- **NEVER use dynamic imports** - Always use static `import` statements at the top of files. Dynamic imports (`await import()`) are a code smell that indicates improper module structure.

  ```typescript
  // ❌ BAD - Dynamic import hides circular dependency
  const { getTokenizerForModel } = await import("../utils/tokenizer");

  // ✅ GOOD - Static import at top of file
  import { getTokenizerForModel } from "../utils/tokenizer";
  ```

- **If you encounter circular dependencies** - Restructure the code to eliminate them. Common solutions:
  - Extract shared types/interfaces into a separate file
  - Move shared utilities into a common module
  - Invert the dependency relationship
  - Use dependency injection instead of direct imports

  Dynamic imports are NOT an acceptable workaround for circular dependencies.

## Workspace IDs - NEVER Construct in Frontend

**CRITICAL: Workspace IDs must NEVER be constructed in the frontend.** This is a dangerous form of duplication that makes the codebase brittle.

- ❌ **BAD** - Constructing workspace ID from parts:

  ```typescript
  const newWorkspaceId = `${projectName}-${newName}`; // WRONG!
  ```

- ✅ **GOOD** - Get workspace ID from backend:
  ```typescript
  const result = await window.api.workspace.rename(workspaceId, newName);
  if (result.success) {
    const newWorkspaceId = result.data.newWorkspaceId; // Backend provides it
  }
  ```

**Why this matters:**

- Workspace ID format is a backend implementation detail
- If the backend changes ID format, frontend breaks silently
- Creates multiple sources of truth
- Leads to subtle bugs and inconsistencies

**Always:**

- Backend operations that change workspace IDs must return the new ID
- Frontend must use the returned ID, never construct it
- Backend is the single source of truth for workspace identity

## IPC Type Boundaries

**Backend types vs Frontend types - Keep them separate.**

The IPC layer is the boundary between backend and frontend. Follow these rules to maintain clean separation:

### Rules:

1. **IPC methods should return backend types** - Use `WorkspaceMetadata`, not custom inline types

   ```typescript
   // ✅ GOOD - Returns backend type
   create(): Promise<{ success: true; metadata: WorkspaceMetadata } | { success: false; error: string }>

   // ❌ BAD - Duplicates type definition inline
   create(): Promise<{ success: true; workspace: { workspaceId: string; projectName: string; ... } }>
   ```

2. **Frontend types extend backend types with UI context** - Frontend has information backend doesn't

   ```typescript
   // Backend type (no projectPath - backend doesn't need it)
   interface WorkspaceMetadata {
     id: string;
     projectName: string;
     workspacePath: string;
   }

   // Frontend type (adds projectPath and branch for UI)
   interface WorkspaceSelection extends WorkspaceMetadata {
     projectPath: string; // Frontend initiated the call, so it has this
     branch: string; // Frontend tracks this for display
     workspaceId: string; // Alias for 'id' to match UI conventions
   }
   ```

3. **Frontend constructs UI types from backend types + local context**

   ```typescript
   // ✅ GOOD - Frontend combines backend data with context it already has
   const result = await window.api.workspace.create(projectPath, branchName);
   if (result.success) {
     setSelectedWorkspace({
       ...result.metadata,
       projectPath, // Frontend already had this
       branch: branchName, // Frontend already had this
       workspaceId: result.metadata.id,
     });
   }

   // ❌ BAD - Backend returns frontend-specific data
   const result = await window.api.workspace.create(projectPath, branchName);
   if (result.success) {
     setSelectedWorkspace(result.workspace); // Backend shouldn't know about WorkspaceSelection
   }
   ```

4. **Never duplicate type definitions in IPC layer** - Always import and use existing types

### Why this matters:

- **Single source of truth** - Backend types are defined once
- **Clean boundaries** - Backend doesn't know about UI concerns
- **Type safety** - Changes to backend types propagate to IPC automatically
- **Prevents duplication** - No need to keep inline types in sync with source types

## Debugging

- `bun debug ui-messages --workspace <workspace-name>` - Show UI messages for a workspace
- `bun debug ui-messages --workspace <workspace-name> --drop <n>` - Show messages with last n dropped
- Workspace names can be found in `~/.cmux/sessions/`

## UX Guidelines

- **DO NOT add UX complexity without permission** - Keep interfaces simple and predictable. Do not add features like auto-dismiss, animations, tooltips, or other UX enhancements unless explicitly requested by the user.

  Example of adding unwanted complexity:

  ```typescript
  // ❌ BAD - Added auto-dismiss without being asked
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);
  ```

  Instead, implement the simplest solution that meets the requirement.

## DRY

Notice when you've made the same change many times, refactor to create a shared function
or component, update all the duplicated code, and then continue on with the original work.

## UX Considerations

- For every operation in the frontend, there should be a keyboard shortcut.
- Buttons, widgets, etc. that have a keybind should display a tooltip for it during hover.

## Logging

In the backend, use the `log` class from `log.ts` to log messages. Particularly spammy messages
should go through `log.debug()`.

## Solving Bugs

- When solving a new bug, consider whether there's a solution that simplifies the overall codebase
  _to_ simplify the bug.
- If you're fixing via simplifcation, a new test case is generally not necessary.
- If fixing through additional complexity, add a test case if an existing convenient harness exists.
  - Otherwise if creating complexity, propose a new test harness to contain the new tests.

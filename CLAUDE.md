# CLAUDE.md - Project Notes for AI Assistants

## Project Context

- **cmux** - Coding Agent Multiplexer
- Electron + React desktop application
- No existing users - migration code is not needed when changing data structures

## Project Structure

- `src/main.ts` - Main Electron process
- `src/preload.ts` - Preload script for IPC
- `src/App.tsx` - Main React component
- `src/config.ts` - Configuration management
- `~/.cmux/config.json` - User configuration file
- `~/.cmux/<project_name>/<branch>` - Workspace directories for git worktrees

## Key Features

- Projects sidebar (left panel)
- Workspaces using git worktrees
- Configuration persisted to `~/.cmux/config.json`

## Package Manager

- **Using bun** - All dependencies are managed with bun (not npm)
- Install dependencies: `bun install`
- Add packages: `bun add <package>`

## Development Commands

- `bun dev` - Start development server (Vite + TypeScript watcher)
- `bun start` - Start Electron app
- `bun build` - Build the application
- `bun typecheck` - Run TypeScript type checking for renderer
- `bun typecheck:main` - Run TypeScript type checking for main process
- `bun fmt` - Format all source files with Prettier
- `bun fmt:check` - Check if files are formatted correctly

## Claude Code SDK

- Use `./docs/sdk-typescript.md` for Claude Code SDK information and reference

## Refactoring

- When refactoring, use `git mv` to preserve file history instead of rewriting files from scratch

## Testing

- Always run `bun typecheck` and `bun typecheck:main` after making changes to verify types

## Styling

- Colors are centralized as CSS variables in `src/styles/colors.tsx`
- Use CSS variables (e.g., `var(--color-plan-mode)`) instead of hardcoded colors

## TypeScript Best Practices

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

- This pattern maximizes type safety and prevents runtime errors from typos or missing cases

## Debugging

- `bun debug ui-messages --workspace <workspace-name>` - Show UI messages for a workspace
- `bun debug ui-messages --workspace <workspace-name> --drop <n>` - Show messages with last n dropped
- Workspace names can be found in `~/.cmux/sessions/`

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

## Claude Code SDK
- Use `./docs/sdk-typescript.md` for Claude Code SDK information and reference

## Refactoring
- When refactoring, use `git mv` to preserve file history instead of rewriting files from scratch

## Testing
- Always run `bun typecheck` and `bun typecheck:main` after making changes to verify types

## Styling
- Colors are centralized as CSS variables in `src/App.tsx` (in the `:root` selector)
- Use CSS variables (e.g., `var(--color-plan-mode)`) instead of hardcoded colors

## Debugging
- `bun debug ui-messages --workspace <workspace-name>` - Show UI messages for a workspace
- `bun debug ui-messages --workspace <workspace-name> --drop <n>` - Show messages with last n dropped
- Workspace names can be found in `~/.cmux/workspaces/`
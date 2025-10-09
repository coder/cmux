# Keyboard Shortcuts

cmux is designed to be keyboard-driven for maximum efficiency. All major actions have keyboard shortcuts.

> **Note**: This document should be kept in sync with `src/utils/ui/keybinds.ts`, which is the source of truth for keybind definitions.

## Platform Conventions

- **macOS**: Shortcuts use `⌘` (Command) as the primary modifier
- **Linux/Windows**: Shortcuts use `Ctrl` as the primary modifier

When documentation shows `Ctrl`, it means:

- `⌘` (Command) on macOS
- `Ctrl` on Linux/Windows

## General

| Action                     | Shortcut |
| -------------------------- | -------- |
| Cancel / Close / Interrupt | `Esc`    |

## Chat & Messages

| Action                 | Shortcut      |
| ---------------------- | ------------- |
| Focus chat input       | `a` or `i`    |
| Send message           | `Enter`       |
| New line in message    | `Shift+Enter` |
| Cancel editing message | `Ctrl+Q`      |
| Jump to bottom of chat | `Shift+G`     |
| Change model           | `Ctrl+/`      |

## Workspaces

| Action                     | Shortcut |
| -------------------------- | -------- |
| Create new workspace       | `Ctrl+N` |
| Next workspace             | `Ctrl+J` |
| Previous workspace         | `Ctrl+K` |
| Open workspace in terminal | `Ctrl+T` |

## Modes

| Action                             | Shortcut       |
| ---------------------------------- | -------------- |
| Toggle between Plan and Exec modes | `Ctrl+Shift+M` |

## Interface

| Action               | Shortcut       |
| -------------------- | -------------- |
| Open command palette | `Ctrl+Shift+P` |
| Toggle sidebar       | `Ctrl+P`       |

## Tips

- **Vim-inspired navigation**: We use `J`/`K` for next/previous navigation, similar to Vim
- **VS Code conventions**: Command palette is `Ctrl+Shift+P` and quick toggle is `Ctrl+P` (use `⌘` on macOS)
- **Consistent modifiers**: Most workspace/project operations use `Ctrl` as the modifier
- **Natural expectations**: We try to use shortcuts users would naturally expect (e.g., `Ctrl+N` for new)

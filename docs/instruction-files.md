# Instruction Files

## Overview

cmux layers instructions from two locations:

1. `~/.cmux/AGENTS.md` (+ optional `AGENTS.local.md`) — global defaults
2. `<workspace>/AGENTS.md` (+ optional `AGENTS.local.md`) — workspace-specific context

Priority within each location: `AGENTS.md` → `AGENT.md` → `CLAUDE.md` (first match wins). If the base file is found, cmux also appends `AGENTS.local.md` from the same directory when present.

## Mode-specific sections (no separate files)

Instead of separate files like `PLAN.md`, cmux reads mode context from sections inside your instruction files. Add a heading titled:

- `Mode: <mode>` (case-insensitive), at any heading level (`#` .. `######`)

Rules:

- Workspace instructions are checked first, then global instructions
- The first matching section wins (at most one section is used)
- The section's content is everything until the next heading of the same or higher level
- Missing sections are ignored (no error)

<!-- Note to developers: This behavior is implemented in src/services/systemMessage.ts (search for extractModeSection). Keep this documentation in sync with code changes. -->

Example (in either `~/.cmux/AGENTS.md` or `my-project/AGENTS.md`):

```markdown
# General Instructions

- Be concise
- Prefer TDD

## Mode: Plan

When planning:

- Focus on goals, constraints, and trade-offs
- Propose alternatives with pros/cons
- Defer implementation detail unless asked

## Mode: Compact

When compacting conversation history:

- Preserve key decisions and their rationale
- Keep code snippets that are still relevant
- Maintain context about ongoing tasks
- Be extremely concise—prioritize information density
```

### Available modes

- **exec** - Default mode for normal operations
- **plan** - Activated when the user toggles plan mode in the UI
- **compact** - Automatically used during `/compact` operations to guide how the AI summarizes conversation history

Customizing the `compact` mode is particularly useful for controlling what information is preserved during automatic history compaction.

## Practical layout

```
~/.cmux/
  AGENTS.md          # Global instructions
  AGENTS.local.md    # Personal tweaks (gitignored)

my-project/
  AGENTS.md          # Project instructions (may include "Mode: Plan", etc.)
  AGENTS.local.md    # Personal tweaks (gitignored)
```

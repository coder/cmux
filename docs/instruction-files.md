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

> **Note to developers:** This behavior is implemented in `src/services/systemMessage.ts` (search for `extractModeSection`). Keep this documentation in sync with code changes.
> Example (in either `~/.cmux/AGENTS.md` or `my-project/AGENTS.md`):

```markdown
# General Instructions

- Be concise
- Prefer TDD

## Mode: Plan

When planning:

- Focus on goals, constraints, and trade-offs
- Propose alternatives with pros/cons
- Defer implementation detail unless asked
```

## Loading flow

```mermaid
graph TD
    A[Start] --> B[Load ~/.cmux/AGENTS.*]
    B --> C[Load <workspace>/AGENTS.*]
    C --> D[Combine Instruction Segments]
    D --> E{Mode provided?}
    E -->|Yes| F[Extract "Mode: <mode>" from <workspace>/AGENTS.*]
    F --> G{Found?}
    G -->|No| H[Extract from ~/.cmux/AGENTS.*]
    G -->|Yes| I[Use workspace section]
    H --> I[Use global section if found]
    I --> J[Build System Message]
    E -->|No| J

    style B fill:#e3f2fd,color:#0d47a1
    style C fill:#e1bee7,color:#4a148c
    style F fill:#fff3e0,color:#e65100
    style H fill:#fff8e1,color:#f57c00
```

## Practical layout

```
~/.cmux/
  AGENTS.md          # Global instructions
  AGENTS.local.md    # Personal tweaks (gitignored)

my-project/
  AGENTS.md          # Project instructions (may include "Mode: Plan", etc.)
  AGENTS.local.md    # Personal tweaks (gitignored)
```

# Instruction Files

## Instruction Files

cmux loads instructions from both global and workspace locations, layering them together:

1. `~/.cmux/AGENTS.md` (+ `AGENTS.local.md`) - Global defaults
2. `<workspace>/AGENTS.md` (+ `AGENTS.local.md`) - Project-specific

**Priority:** `AGENTS.md` → `AGENT.md` → `CLAUDE.md` (first found)

**Local variants:** Add personal preferences to `AGENTS.local.md` and `.gitignore` it.

## Plan Files (Plan Mode Only)

When in **Plan mode**, cmux includes `.cmux/PLAN.md` to guide planning behavior. Plan files layer the same as instruction files:

1. `~/.cmux/.cmux/PLAN.md` (+ `PLAN.local.md`) - Global plan behavior
2. `<workspace>/.cmux/PLAN.md` (+ `PLAN.local.md`) - Workspace-specific plan behavior

## Loading Behavior

```mermaid
graph TD
    A[Start] --> B{Mode?}
    B -->|Any Mode| C[Load Global AGENTS.md]
    C --> D[Load Global AGENTS.local.md]
    D --> E[Load Workspace AGENTS.md]
    E --> F[Load Workspace AGENTS.local.md]

    B -->|Plan Mode| G[Load Global .cmux/PLAN.md]
    G --> H[Load Global .cmux/PLAN.local.md]
    H --> I[Load Workspace .cmux/PLAN.md]
    I --> J[Load Workspace .cmux/PLAN.local.md]

    F --> K[Layer All Found Files]
    J --> K
    K --> L[Build System Message]

    style C fill:#e1f5ff
    style E fill:#e1f5ff
    style G fill:#fff4e1
    style I fill:#fff4e1
```

All files are optional. If a file doesn't exist, it's skipped. Files layer together - they don't override each other.

## Example Structure

```
~/.cmux/
  AGENTS.md          # Global preferences
  AGENTS.local.md    # Personal overrides (gitignored)
  .cmux/
    PLAN.md          # Global plan mode behavior
    PLAN.local.md    # Personal plan tweaks (gitignored)

my-project/
  AGENTS.md          # Project guidelines
  AGENTS.local.md    # Local notes (gitignored)
  .cmux/
    PLAN.md          # Project-specific plan mode behavior
    PLAN.local.md    # Local plan notes (gitignored)
```

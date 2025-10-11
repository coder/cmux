# Instruction Files

## Instruction Files

cmux layers instructions from two locations:

1. `~/.cmux/AGENTS.md` (+ optional `AGENTS.local.md`) — global defaults
2. `<workspace>/AGENTS.md` (+ optional `AGENTS.local.md`) — workspace-specific context

**Priority:** `AGENTS.md` → `AGENT.md` → `CLAUDE.md` (first match wins per directory)

## Plan Files (Plan Mode Only)

Plan mode adds `.cmux/PLAN.md` files to influence planning behavior. The search order mirrors instruction layering:

1. `~/.cmux/PLAN.md`
2. `<workspace>/.cmux/PLAN.md` (+ optional `PLAN.local.md`)

## Loading Flow

```mermaid
graph TD
    A[Start] --> B{Mode?}
    B -->|Any Mode| C[Load ~/.cmux/AGENTS.*]
    C --> D[Load <workspace>/AGENTS.*]

    B -->|Plan| E[Load ~/.cmux/PLAN.md]
    E --> F[Load <workspace>/.cmux/PLAN.md]
    F --> G[Append <workspace>/.cmux/PLAN.local.md]

    D --> H[Combine Instruction Segments]
    G --> I[Combine Plan Segments]
    H --> J[Build System Message]
    I --> J

    style C fill:#e3f2fd,color:#0d47a1
    style D fill:#e1bee7,color:#4a148c
    style E fill:#fff3e0,color:#e65100
    style F fill:#fff8e1,color:#f57c00
    style G fill:#ffe0b2,color:#bf360c
```

Missing files are simply skipped; nothing overrides previously loaded content.

## Example Layout

```
~/.cmux/
  AGENTS.md          # Global prompts
  PLAN.md            # Global plan guidance (optional)

my-project/
  AGENTS.md          # Project prompts
  AGENTS.local.md    # Local overrides (gitignored)
  .cmux/
    PLAN.md          # Project plan behavior
    PLAN.local.md    # Local plan tweaks (gitignored)
```

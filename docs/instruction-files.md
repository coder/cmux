# Instruction Files

## Instruction Files

cmux loads instructions from both global and workspace locations, layering them together:

1. `~/.cmux/AGENTS.md` (+ `AGENTS.local.md`) - Global defaults
2. `<workspace>/AGENTS.md` (+ `AGENTS.local.md`) - Project-specific

**Priority:** `AGENTS.md` → `AGENT.md` → `CLAUDE.md` (first found)

**Local variants:** Add personal preferences to `AGENTS.local.md` and `.gitignore` it.

## Plan Files (Plan Mode Only)

When in **Plan mode**, cmux includes `.cmux/PLAN.md` to guide planning behavior.

**Search order:**

1. `~/.cmux/.cmux/PLAN.md`
2. `<workspace>/.cmux/PLAN.md`
3. `~/.cmux/.cmux/PLAN.local.md`
4. `<workspace>/.cmux/PLAN.local.md`

First found wins. Use this to control how the agent approaches planning in that mode.

## Example Structure

```
~/.cmux/
  AGENTS.md          # Global preferences
  AGENTS.local.md    # Personal overrides (gitignored)
  .cmux/
    PLAN.md          # Global plan mode behavior

my-project/
  AGENTS.md          # Project guidelines
  AGENTS.local.md    # Local notes (gitignored)
  .cmux/
    PLAN.md          # Project-specific plan mode behavior
```

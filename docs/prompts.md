# Prompts

cmux supports multiple ways to customize agent behavior through instruction files and planning context.

## Instruction Files

Instruction files define how agents should behave. They're written in markdown and can contain any guidance you want to give to the AI.

### File Locations

cmux searches for instruction files in two locations:

1. **Global instructions** - `~/.cmux/AGENTS.md`
   - Applies to all projects and workspaces
   - Good for personal preferences and coding standards

2. **Workspace instructions** - `<workspace>/AGENTS.md`
   - Applies only to this specific project
   - Good for project-specific guidelines

Both locations are used if found. Global instructions load first, then workspace instructions layer on top.

### File Priority

Within each location, cmux looks for files in this order:

1. `AGENTS.md` - Multi-agent instructions
2. `AGENT.md` - Single agent instructions
3. `CLAUDE.md` - Claude-specific instructions

The first file found is used.

### Local Variants

After loading a base instruction file, cmux also checks for `AGENTS.local.md` in the same directory.

This allows you to:

- Keep personal preferences separate from team guidelines
- Add `AGENTS.local.md` to `.gitignore`
- Share base instructions via git while keeping local customizations private

### Example Structure

```
~/.cmux/
  AGENTS.md          # Your global coding preferences
  AGENTS.local.md    # Personal preferences (in .gitignore)

my-project/
  AGENTS.md          # Project-specific guidelines
  AGENTS.local.md    # Your local project notes (in .gitignore)
```

With this setup, agents will see:

1. Your global preferences (`~/.cmux/AGENTS.md`)
2. Your global local preferences (`~/.cmux/AGENTS.local.md`)
3. Project guidelines (`my-project/AGENTS.md`)
4. Your local project notes (`my-project/AGENTS.local.md`)

## Plan Files

Plan files provide task-specific context without modifying permanent instruction files. They're useful for:

- Current development goals
- Implementation strategies
- Temporary constraints or requirements

### File Locations

Plan files live in `.cmux/PLAN.md` within either:

1. **Global plan** - `~/.cmux/.cmux/PLAN.md`
   - Applies to all workspaces
2. **Workspace plan** - `<workspace>/.cmux/PLAN.md`
   - Applies to this workspace only

Unlike instruction files, **only the first plan file found is used**. cmux searches in this order:

1. `~/.cmux/.cmux/PLAN.md`
2. `<workspace>/.cmux/PLAN.md`
3. `~/.cmux/.cmux/PLAN.local.md`
4. `<workspace>/.cmux/PLAN.local.md`

### When to Use Plans vs Instructions

| Use AGENTS.md when...       | Use PLAN.md when...               |
| --------------------------- | --------------------------------- |
| Guidelines apply long-term  | Context is temporary              |
| Defining coding standards   | Describing current task           |
| Setting project conventions | Outlining implementation approach |
| Permanent preferences       | Active development goals          |

### Example Workflow

```bash
# Start a new feature
echo "# Add User Authentication\n\nImplement JWT-based auth..." > .cmux/PLAN.md

# Work with agents on the feature
# ...agents see the plan context automatically

# Finish the feature
rm .cmux/PLAN.md
```

## Best Practices

### Keep Instructions Focused

Don't repeat information already in the base system prompt. Add project-specific context.

❌ **Avoid generic advice:**

```markdown
# AGENTS.md

You should write clean code and follow best practices.
```

✅ **Provide specific context:**

```markdown
# AGENTS.md

This project uses:

- Domain-driven design patterns
- Functional core, imperative shell
- Railway-oriented programming for error handling
```

### Use Local Files for Personal Preferences

```markdown
# AGENTS.md (committed to git)

Follow the project's TypeScript style guide.

# AGENTS.local.md (in .gitignore)

I prefer explicit return types on all functions.
Use descriptive variable names, even if verbose.
```

### Structure Plans for Clarity

```markdown
# PLAN.md

## Goal

Add real-time notifications using WebSockets

## Approach

1. Set up Socket.IO server in existing Express app
2. Create notification event types
3. Build React hook for connection management

## Constraints

- Must work with existing authentication
- Keep backward compatibility with polling fallback
```

## Technical Details

### How Instruction Files Are Loaded

1. Search `~/.cmux/` for first available: `AGENTS.md`, `AGENT.md`, or `CLAUDE.md`
2. If found, also check for `~/.cmux/AGENTS.local.md` and append
3. Search `<workspace>/` for first available instruction file
4. If found, also check for `<workspace>/AGENTS.local.md` and append
5. Combine all found content into system message

### How Plan Files Are Loaded

1. Check `~/.cmux/.cmux/PLAN.md`
2. If not found, check `<workspace>/.cmux/PLAN.md`
3. If not found, check `~/.cmux/.cmux/PLAN.local.md`
4. If not found, check `<workspace>/.cmux/PLAN.local.md`
5. Use first file found (or none if all missing)

The plan content is added to the system message in a `<plan>` section, making it available to the agent for all interactions in that workspace.

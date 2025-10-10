# Custom Prompts

You can customize agent behavior by adding instruction files to your project root.

## Instruction Files

cmux looks for custom instruction files in priority order:

1. `AGENTS.md` - Multi-agent instructions
2. `AGENT.md` - Single agent instructions  
3. `CLAUDE.md` - Claude-specific instructions

**The first file found is used.** If you have multiple files, only the highest priority one is loaded.

## Local Instructions

After loading a base instruction file, cmux also looks for `AGENTS.local.md` and appends its contents.

This allows you to:
- Keep personal preferences in `AGENTS.local.md`
- Add it to `.gitignore` to avoid committing local-only instructions
- Share base instructions via `AGENTS.md` with your team

## Example Setup

```bash
# Shared team instructions (committed)
echo "# Project Instructions" > AGENTS.md
echo "- Follow our coding standards" >> AGENTS.md

# Your personal additions (gitignored)
echo "AGENTS.local.md" >> .gitignore
echo "# My Preferences" > AGENTS.local.md
echo "- Use verbose logging" >> AGENTS.local.md
```

The agent will receive both files concatenated together.

## Use Cases

- **Project conventions** - Document architecture, testing practices, coding standards
- **Context** - Explain non-obvious design decisions or technical constraints
- **Workflows** - Describe how your team handles PRs, deployments, etc.
- **Personal preferences** - Keep your own customizations in `AGENTS.local.md`

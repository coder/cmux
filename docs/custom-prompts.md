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

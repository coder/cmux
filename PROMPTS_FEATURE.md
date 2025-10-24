# Custom Prompt Mentions (@)

## Overview
You can now reference reusable prompt templates using `@mention` syntax in the chat input. These prompts are expanded before being sent to the AI.

## How to Use

1. **Type `@` in the chat input** - An autocomplete menu will appear showing available prompts
2. **Start typing a prompt name** - The list will filter to matching prompts
3. **Select a prompt** - Use Tab, arrow keys, or click to insert the prompt name
4. **Send your message** - The `@prompt-name` will be automatically replaced with the prompt's content

## Example
```
@explain React hooks
```

When sent, this becomes:
```
Please provide a clear, comprehensive explanation of the topic.

Include:
- Key concepts
- Examples where applicable
- Common pitfalls or misunderstandings

React hooks
```

## Creating Prompts

### System-wide prompts
Create `.md` files in `~/.cmux/prompts/`:
```bash
echo "Your prompt content here" > ~/.cmux/prompts/my-prompt.md
```

### Repository-specific prompts
Create `.md` files in your project's `.cmux/` directory:
```bash
mkdir -p .cmux
echo "Your repo-specific prompt" > .cmux/review.md
```

## Prompt Priority
- Repository prompts (`.cmux/`) override system prompts (`~/.cmux/prompts/`)
- This allows per-project customization

## Features
- **Autocomplete**: Shows all available prompts with filtering
- **Keyboard navigation**: Tab to complete, arrow keys to navigate, Esc to dismiss
- **Visual indicators**: 📁 for repo prompts, 🏠 for system prompts
- **Multiple mentions**: Use multiple `@prompts` in a single message
- **Markdown support**: Prompts can contain any markdown content

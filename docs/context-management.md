# Context Management

Commands for managing conversation history length and token usage.

## `/clear` - Clear All History

Remove all messages from conversation history. Equivalent to `/truncate 100`.

### Syntax

```
/clear
```

### Examples

```
/clear
```

Start fresh with an empty conversation.

### Notes

- Instant deletion of all messages
- **Irreversible** - all history is permanently removed
- Use when you want to start a completely new conversation

---

## `/compact` - AI Summarization

Compress conversation history using AI summarization. Replaces the conversation with a compact summary that preserves context.

### Syntax

```
/compact [maxTokens] [instructions...]
```

### Parameters

- `maxTokens` (optional) - Maximum output tokens for the summary (defaults to 32000)
- `instructions` (optional) - Additional instructions to guide the summarization

### Examples

```
/compact
```

Basic compaction with default settings.

```
/compact 1000
```

Limit summary to 1000 output tokens.

```
/compact 2000 next up, we're adding a dark theme 
```

Compact with token limit and custom instructions.

### Notes

- Uses the selected LLM summarize conversation history
- Preserves actionable context and specific details
- **Irreversible** - original messages are replaced

---

## `/truncate` - Simple Truncation

Remove a percentage of messages from conversation history (from the oldest first).

### Syntax

```
/truncate <percentage>
```

### Parameters

- `percentage` (required) - Percentage of messages to remove (0-100)

### Examples

```
/truncate 50
```

Remove oldest 50% of messages.

### Notes

- Simple deletion, no AI involved
- Removes messages from oldest to newest
- Faster than `/compact` but loses context
- **Irreversible** - messages are permanently removed

---

## Comparison

| Feature | `/clear` | `/truncate` | `/compact` |
|---------|----------|------------|------------|
| **Speed** | Instant | Instant | Slower (uses AI) |
| **Context Preservation** | None | None | Intelligent summary |
| **Customization** | None | Percentage | Token limit + instructions |
| **Cost** | Free | Free | Uses API tokens |
| **Reversible** | No | No | No |

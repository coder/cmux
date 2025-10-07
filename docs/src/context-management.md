# Context Management

Commands for managing conversation history length and token usage.

## `/compact` - AI Summarization

Compress conversation history using AI summarization. Replaces the conversation with a compact summary that preserves context.

### Syntax

```
/compact [maxTokens] [instructions...]
```

### Parameters

- `maxTokens` (optional) - Maximum output tokens for the summary (e.g., 2000)
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
/compact 2000 Focus on technical decisions and current implementation status
```

Compact with token limit and custom instructions.

### Notes

- Uses the AI model to intelligently summarize conversation history
- Preserves actionable context and specific details
- Replaces existing conversation with the summary
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

```
/truncate 25
```

Remove oldest 25% of messages.

```
/truncate 75
```

Remove oldest 75% of messages.

### Notes

- Simple deletion, no AI involved
- Removes messages from oldest to newest
- Faster than `/compact` but loses context
- **Irreversible** - messages are permanently removed

---

## Comparison

| Feature | `/compact` | `/truncate` |
|---------|-----------|------------|
| **Speed** | Slower (uses AI) | Fast (instant) |
| **Context Preservation** | Intelligent summary | None (simple deletion) |
| **Customization** | Token limit + instructions | Percentage only |
| **Cost** | Uses API tokens | Free |
| **Reversible** | No | No |

# Context Management

Commands for managing conversation history length and token usage.

## Comparison

| Approach                  | `/clear` | `/truncate` | `/compact`       | Plan Compaction | 
| ------------------------ | -------- | ----------- | ---------------- | ---------------- |
| **Speed**                | Instant  | Instant     | Slower (uses AI) |  Instant |
| **Context Preservation** | None     | Temporal    | Intelligent      |  Intelligent | 
| **Cost**                 | Free     | Free        | Uses API tokens  | Free |
| **Reversible**           | No       | No          | No               | Yes | 


## Plan Compaction

If you've produced a plan, you can opportunistically click "Compact Here" on the plan to use that
as the entire conversation history. This operation is instant as all of the LLM's work was already
done when it created the plan.

![Plan Compaction](./img/plan-compact.webp)

This is a form of "opportunistic compaction" and is special in that you can review the post-compact
context before the old context is permanently removed.

## `/clear` - Clear All History

Remove all messages from conversation history.

### Syntax

```
/clear
```

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
- About as fast as `/clear`
- `/truncate 100` is equivalent to `/clear`
- **Irreversible** - messages are permanently removed

### OpenAI Responses API Limitation

⚠️ **`/truncate` does not work with OpenAI models** due to the Responses API architecture:

- OpenAI's Responses API stores conversation state server-side
- Manual message deletion via `/truncate` doesn't affect the server-side state
- Instead, OpenAI models use **automatic truncation** (`truncation: "auto"`)
- When context exceeds the limit, the API automatically drops messages from the middle of the conversation

**Workarounds for OpenAI:**

- Use `/clear` to start a fresh conversation
- Use `/compact` to intelligently summarize and reduce context
- Rely on automatic truncation (enabled by default)

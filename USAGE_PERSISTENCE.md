# Usage Metadata Persistence Architecture

## Current State ✅

Usage metadata **is being persisted correctly** to `chat.jsonl`. No backend changes needed.

## Flow

```
AI SDK streamResult.usage
  ↓
StreamManager (line 836: usage, // AI SDK normalized usage)
  ↓
stream-end event metadata
  ↓
finalAssistantMessage.metadata (line 850-853)
  ↓
historyService.updateHistory() (line 862)
  ↓
chat.jsonl (JSON.stringify, line 174)
```

## Evidence

Recent messages in `chat.jsonl` contain usage:

```json
{
  "inputTokens": 1600,
  "outputTokens": 87,
  "totalTokens": 1687,
  "cachedInputTokens": 90007
}
```

This is the full `LanguageModelV2Usage` object from the AI SDK, which includes:
- inputTokens (uncached input)
- cachedInputTokens (cached input)  
- outputTokens (total output)
- reasoningTokens (if present)

Plus providerMetadata in the parent metadata object.

## Historical Messages

Old messages don't have `usage` because they were created before usage tracking was implemented. This is expected and acceptable.

## Frontend Handling

The two-store architecture gracefully handles both cases:

- **With usage**: Shows Context Usage bar and Cost sections
- **Without usage**: Only shows Consumer Breakdown (from tokenization)

No migration needed - users see costs going forward.

## Conclusion

**No backend changes required**. Usage persistence is working as designed. The frontend implementation correctly handles missing usage for historical messages.

# OpenAI Reasoning Error Reproduction Test

## Problem

OpenAI reasoning models (gpt-5-codex, o3-mini, etc.) intermittently return this error:

```
Item 'rs_*' of type 'reasoning' was provided without its required following item.
```

This occurs in multi-turn conversations, especially when:
- Previous responses contained reasoning parts
- Tool calls are involved
- The `previous_response_id` parameter is used

## Test

`openaiReasoning.test.ts` - Attempts to reproduce the error by:
1. Sending a message that triggers reasoning + tool calls
2. Sending follow-up messages that reference the conversation history
3. Running multiple attempts since the error is intermittent

## Running the Test

```bash
# Run with default 10 attempts
TEST_INTEGRATION=1 bun x jest tests/ipcMain/openaiReasoning.test.ts

# Run with more attempts to increase reproduction chance
OPENAI_REASONING_TEST_RUNS=20 TEST_INTEGRATION=1 bun x jest tests/ipcMain/openaiReasoning.test.ts

# Run with fewer attempts for quick testing
OPENAI_REASONING_TEST_RUNS=3 TEST_INTEGRATION=1 bun x jest tests/ipcMain/openaiReasoning.test.ts
```

## Expected Behavior

The test will:
- Run N attempts (default 10)
- For each attempt, create a fresh workspace
- Send 3 messages in sequence
- Check for the specific error in stream events
- Report if the error was reproduced

## Output

Success (error reproduced):
```
🎯 [Run 5] REPRODUCED THE ERROR on second message!
✅ Successfully reproduced the OpenAI reasoning error!
```

No reproduction:
```
❌ Failed to reproduce the error after 10 attempts
Consider increasing OPENAI_REASONING_TEST_RUNS or modifying the test prompts
```

## Why Multiple Attempts?

The error is intermittent and depends on:
- OpenAI's internal state management
- Timing of requests
- Specific conversation patterns
- Model behavior variations

## Next Steps

Once reproduced:
1. Examine the debug dumps in `~/.cmux/debug_obj/<workspace>/`
2. Check the conversation history in `~/.cmux/sessions/<workspace>/chat.jsonl`
3. Analyze the `providerMetadata` on reasoning parts
4. Test potential fixes (e.g., clearing `providerMetadata`, omitting `previous_response_id`)

## Related

- GitHub Issue: vercel/ai#7099
- User's fix: @gvkhna's solution for similar issue
- PR #61, PR #68: Previous fix attempts (reverted)

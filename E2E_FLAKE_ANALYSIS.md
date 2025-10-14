# E2E Test Flake Analysis - OpenAI Auto Truncation Test

## Issue
Integration test failing intermittently:  
**Test**: `OpenAI auto truncation integration > openai should include full file_edit diff in UI/history but redact it from the next provider request`

**Failure**: https://github.com/coder/cmux/actions/runs/18507259214/job/52739172616

## Root Cause

This is a **real integration test** making actual API calls to OpenAI/Anthropic. The test fails when the AI model:
1. Successfully executes tool calls (file_edit)
2. But doesn't generate final text output
3. Causing stream to never emit `stream-end` event

**Events captured**:
```
[stream-start, reasoning-end, tool-call-start, tool-call-end, reasoning-end, tool-call-start, tool-call-end]
```

**Missing**: `stream-end` event

## Why It's Flaky

The AI's behavior is non-deterministic. Sometimes after making tool calls, the model:
- ✅ Generates text response → stream completes normally
- ❌ Decides no text is needed → stream hangs (no stream-end)

This is a known issue with LLM APIs - they can complete tool calls without generating text output, and different API implementations handle this differently.

## Proposed Solutions

### Option 1: Add Timeout/Retry Logic (Quick Fix)
- Already has 3 retries in CI (jest.retryTimes(3))
- But retries don't help if the issue is consistent for that specific test run
- Could add timeout logic to detect hung streams and force stream-end

### Option 2: Make Test More Robust (Better Fix)
- Modify test prompt to encourage text response after tool calls
- Example: "Open and replace 'line2' with 'LINE2' in redaction-edit-test.txt **and confirm the change was made**"
- This increases likelihood of text output after tool execution

### Option 3: Fix Stream Manager (Root Cause Fix)
- Detect when all tool calls complete but no text is generated
- Automatically emit stream-end if stream is idle after tool completion
- This would fix the issue for all tests and production use

### Option 4: Use Mock Scenarios for This Test
- Convert this test to use CMUX_MOCK_AI mode
- Create scripted scenarios that always complete properly
- Trade-off: No longer testing real API behavior

## Recommendation

**Short term**: Option 2 (modify test prompt)  
**Long term**: Option 3 (fix stream manager to handle tool-only responses)

The stream manager should handle the case where an AI completes tool calls without generating text. This is a valid response pattern and should emit `stream-end` rather than hanging indefinitely.

## Test Location
- File: `tests/ipcMain/sendMessage.test.ts:1306`
- Line: 1326 (first stream assertion)
- Timeout: 90 seconds (test level), 30 seconds (event wait)

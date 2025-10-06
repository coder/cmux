# Integration Test Failure Investigation

## Problem Statement

The integration test `"openai should respect tool policy that disables file_edit tools"` is failing on main branch. The test times out waiting for a `stream-end` event that never arrives.

**Failing assertion:**
```
expect(collector.hasStreamEnd()).toBe(true)
// Expected: true
// Received: false
```

## Timeline

- ✅ **Last Success**: Commit `d85fe16` (Oct 5, 23:35) - "feat: change default model to claude-sonnet-4-5"
- ❌ **First Failure**: Commit `461b60a` (Oct 5, 23:43) - "feat: rework StreamingBarrier to resemble InterruptedBarrier"
- ❌ **Still Failing**: Commit `8d74605` (Oct 6, 09:56) - "fix: minor git worktree bug"

## What We Know

### The Test
- **Location**: `tests/ipcMain/sendMessage.test.ts:860-898`
- **What it does**:
  1. Creates a test file with content
  2. Asks AI to edit the file
  3. Disables BOTH `bash` and `file_edit_*` tools via tool policy
  4. Expects AI to respond (without using tools since they're disabled)
  5. Waits for `stream-end` event (30s timeout)
  6. Verifies file wasn't modified

### Investigation Results

1. **StreamingBarrier refactor (461b60a) timeline matches failure** - This commit introduced the failure
2. **Reverting 461b60a did NOT fix the issue** - This suggests:
   - The commit exposed an existing race condition
   - OR there's a related but separate issue
   - OR main has multiple issues compounding
3. **No bash tool involvement** - The test disables bash, so bash tool changes are not involved

### Key Files Changed in 461b60a
- `src/components/AIView.tsx` - Replaced inline streaming indicator with `<StreamingBarrier />`
- `src/components/Messages/ChatBarrier/BaseBarrier.tsx` - New shared barrier component
- `src/components/Messages/ChatBarrier/StreamingBarrier.tsx` - New streaming barrier
- `src/components/Messages/ChatBarrier/InterruptedBarrier.tsx` - Refactored interrupted barrier
- `src/components/Messages/InterruptedBarrier.tsx` - Deleted (moved to ChatBarrier/)

## Reproduction Steps

### Local Reproduction (requires API keys)

```bash
export OPENAI_API_KEY="your-key"
export ANTHROPIC_API_KEY="your-key"
TEST_INTEGRATION=1 bun x jest tests/ipcMain/sendMessage.test.ts -t "openai should respect tool policy that disables file_edit tools"
```

### Check CI Logs

```bash
# Find recent failed runs on main
gh run list --workflow="CI" --branch=main --limit=10

# View specific run logs
gh run view <run-id> --log | grep -A20 "tool policy"
```

## Debugging Approach

### 1. Understand the Event Flow

**Key question**: Why isn't `stream-end` being emitted?

Check these areas:
- `src/services/streamManager.ts` - Handles streaming and emits events
- Look for where `stream-end` event is emitted
- Check if there are any conditions that prevent it from firing
- Look for error handling that might swallow the event

### 2. Check for Race Conditions

The StreamingBarrier change involved UI rendering. Potential issues:
- Does the UI component somehow block event emission?
- Is there a React rendering cycle issue?
- Check `src/components/AIView.tsx` for any event listener changes

### 3. Add Debugging to the Test

Modify the test to log what events ARE being received:

```typescript
const collector = createEventCollector(env.sentEvents, workspaceId);
console.log('Waiting for stream-end...');
console.log('Events received so far:', collector.getAllEvents());

// Add timeout handler
const timeout = setTimeout(() => {
  console.log('TIMEOUT! Events received:', collector.getAllEvents());
  console.log('Has stream-end:', collector.hasStreamEnd());
  console.log('Has error:', collector.hasError());
}, 29000);

await collector.waitForEvent("stream-end", 30000);
clearTimeout(timeout);
```

### 4. Check StreamManager Event Emission

Add logging to `streamManager.ts` around stream-end emission:

```typescript
// Find where stream-end is emitted
this.emit('stream-end', ...);
console.log('[STREAM] Emitting stream-end event');
```

### 5. Bisect to Find Root Cause

If reverting 461b60a didn't fix it, bisect further:

```bash
git bisect start
git bisect bad 8d74605  # Known bad
git bisect good d85fe16 # Known good
# Test each commit
```

### 6. Check for Tool Policy Bug

Since the test disables tools, check:
- Does disabling tools prevent stream completion?
- Is there error handling when AI tries to use disabled tools?
- Check `src/utils/tools/toolPolicy.ts`
- Look at tool execution flow when tools are disabled

### 7. Compare Working vs Broken Commits

```bash
# Checkout working commit
git checkout d85fe16

# Run test (should pass)
TEST_INTEGRATION=1 bun x jest tests/ipcMain/sendMessage.test.ts -t "tool policy"

# Checkout broken commit  
git checkout 461b60a

# Run test (should fail)
# Compare logs/behavior
```

## Useful Commands

```bash
# Run just the failing test
TEST_INTEGRATION=1 bun x jest tests/ipcMain/sendMessage.test.ts -t "openai should respect tool policy that disables file_edit"

# Run all tool policy tests
TEST_INTEGRATION=1 bun x jest tests/ipcMain/sendMessage.test.ts -t "tool policy"

# Check which files changed between commits
git diff d85fe16..461b60a --name-only

# View specific file changes
git diff d85fe16..461b60a -- src/components/AIView.tsx
```

## Potential Root Causes

Based on investigation, ranked by likelihood:

1. **Race condition in event emission** - StreamingBarrier change exposed timing issue
2. **Tool policy edge case** - When all tools disabled, stream doesn't complete properly
3. **Error swallowing** - Error occurs but isn't propagated, preventing stream-end
4. **React rendering blocking** - New barrier component interferes with event loop
5. **Timeout issue** - Something is genuinely timing out after 30s

## Next Steps

1. Add comprehensive logging to the test to see what events ARE received
2. Check streamManager.ts for where stream-end is emitted and add logging
3. Run the test at commit d85fe16 vs 461b60a and compare logs
4. If needed, git bisect between d85fe16 and 461b60a to find exact breaking commit
5. Once root cause identified, add regression test to prevent recurrence

## Files to Focus On

- `tests/ipcMain/sendMessage.test.ts` - The failing test
- `src/services/streamManager.ts` - Stream event emission
- `src/components/AIView.tsx` - Changed in 461b60a
- `src/utils/tools/toolPolicy.ts` - Tool disabling logic
- `tests/ipcMain/helpers.ts` - Test helpers (EventCollector, assertStreamSuccess)

## Questions to Answer

1. What events IS the collector receiving? (add logging)
2. Is an error occurring that prevents stream-end? (check hasError())
3. Does the stream actually complete server-side? (add server logs)
4. Is this specific to OpenAI or does Anthropic fail too? (run anthropic variant)
5. Does this happen with other tool policy combinations? (try disabling only file_edit)

## Success Criteria

- Test passes consistently on main branch
- Root cause identified and documented
- Regression test added if needed
- CI passes on main

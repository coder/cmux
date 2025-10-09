# Manual Testing Plan for Smart Stream Resumption

## Setup
1. Start dev mode: `make dev`
2. Create a test workspace with a streaming message

## Test Cases

### Test 1: Window Close Auto-Resume ✅
**Steps:**
1. Start a stream (ask a question)
2. While streaming, close the app (Cmd+Q)
3. Reopen the app
4. Switch to the workspace with the partial message

**Expected:**
- Console shows: `[useResumeManager] Initial scan on mount`
- Console shows: `[useResumeManager] Attempting resume for {workspace} (attempt 1)`
- Stream automatically resumes
- No RetryBarrier shown (or briefly shown then disappears)

### Test 2: Network Error Background Retry ✅
**Steps:**
1. Start a stream
2. Simulate network error (disconnect WiFi mid-stream)
3. Message shows as partial with RetryBarrier
4. Countdown starts: "Retrying in 1s (attempt 1)"
5. Reconnect WiFi
6. Wait for countdown to reach 0

**Expected:**
- Console shows: `[useResumeManager] Resume check requested for {workspace}`
- RetryBarrier shows countdown
- After 1s, attempts resume
- If successful: stream continues, barrier disappears
- If failed: attempts again with 2s delay (exponential backoff)

### Test 3: User Ctrl+C No Auto-Resume ✅
**Steps:**
1. Start a stream
2. Press Ctrl+C to interrupt
3. RetryBarrier shows "Stream interrupted" with "Retry" button
4. Click "Stop Auto-Retry" (if showing countdown)
5. Close app and reopen
6. Switch to workspace

**Expected:**
- RetryBarrier shows manual retry button (not countdown)
- Console does NOT show auto-resume attempt
- `[INTERRUPTED]` sentinel added to model context
- Manual retry button works when clicked

### Test 4: Multiple Workspaces ✅
**Steps:**
1. Create 3 workspaces
2. Start streams in all 3
3. Close app mid-stream (all 3 partial)
4. Reopen app

**Expected:**
- Console shows resume attempts for all 3 workspaces
- All 3 workspaces auto-retry in parallel
- Can switch between workspaces, all show progress

### Test 5: Background Retry (Non-Visible) ✅
**Steps:**
1. Create 2 workspaces (A and B)
2. In workspace A, start a stream
3. Disconnect WiFi (creates partial)
4. Switch to workspace B
5. Reconnect WiFi
6. Wait 1-2 seconds

**Expected:**
- Workspace A auto-retries in background (not visible)
- Console shows retry attempt even though workspace A not visible
- Switch back to A: stream resumed successfully

## Verification Checklist

- [ ] Type checking passes: `bun run typecheck`
- [ ] Dev server starts: `make dev`
- [ ] Event emissions logged in console
- [ ] Countdown display updates correctly
- [ ] Exponential backoff sequence observed (1s, 2s, 4s, 8s, ...)
- [ ] Stop Auto-Retry button works
- [ ] Manual Retry button works
- [ ] Multiple workspace handling works
- [ ] Background retry works for non-visible workspaces

## Debug Commands

Check localStorage state:
```javascript
// In browser console
console.log('autoRetry:', localStorage.getItem('{workspaceId}-autoRetry'))
console.log('retryState:', localStorage.getItem('{workspaceId}-retryState'))
```

Clear retry state:
```javascript
localStorage.removeItem('{workspaceId}-autoRetry')
localStorage.removeItem('{workspaceId}-retryState')
```

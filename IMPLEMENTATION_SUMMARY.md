# 🤖 Smart Stream Resumption Implementation

## Summary

Implemented a centralized, event-driven auto-resume system for interrupted streams. The system automatically resumes streams on app startup and after runtime failures, with no user intervention required for accidental disconnections.

## Files Changed

### 1. `src/constants/events.ts`
- Added `RESUME_CHECK_REQUESTED` custom event
- Used for event-driven architecture (no polling)

### 2. `src/utils/messages/sendOptions.ts` (NEW)
- Extracted `getSendOptionsFromStorage()` helper
- DRY implementation - mirrors `useSendMessageOptions` logic
- Works outside React context for use in event handlers

### 3. `src/hooks/useResumeManager.ts` (NEW)
- **Centralized resume logic** - Single source of truth for all retry behavior
- **Event-driven** - Listens for `RESUME_CHECK_REQUESTED` events
- **Idempotent** - Safe to call multiple times, silently ignores invalid requests
- **Exponential backoff** - 1s → 2s → 4s → 8s → ... → 60s (max)
- **Background operation** - Works for all workspaces, visible or not

Key features:
- Initial scan on mount for startup recovery
- Event listener for runtime failures
- Checks eligibility: interrupted stream + autoRetry=true + backoff timer expired
- Manages retry state in localStorage
- Prevents concurrent retries with Set tracking

### 4. `src/hooks/useWorkspaceAggregators.ts`
- Emits `RESUME_CHECK_REQUESTED` events on:
  - `stream-error` (network failures, rate limits, etc.)
  - `stream-abort` (user Ctrl+C or window close)
- Returns `workspaceStates` Map for consumers

### 5. `src/components/Messages/ChatBarrier/RetryBarrier.tsx`
- **Simplified to pure presentation** - No retry logic
- Reads retry state from localStorage (managed by useResumeManager)
- Calculates countdown for display only
- Manual retry button still works (user-initiated action)
- Stop auto-retry button sets autoRetry=false

### 6. `src/App.tsx`
- Integrated `useResumeManager(workspaceStates)`
- Runs after workspace aggregators are initialized

## Architecture

```
┌─────────────────┐
│ Stream Failure  │
│ (error/abort)   │
└────────┬────────┘
         │
         ▼
┌───────────────────────┐
│ useWorkspaceAggregators│
│ (handles IPC events)  │
└────────┬──────────────┘
         │
         │ Emits RESUME_CHECK_REQUESTED
         ▼
┌───────────────────────┐
│  useResumeManager     │
│  (event listener)     │
└────────┬──────────────┘
         │
         │ isEligibleForResume()?
         ▼
    ┌────┴────┐
    │  Yes    │  No → Silent ignore
    └────┬────┘
         │
         ▼
┌───────────────────────┐
│  resumeStream()       │
│  (backend IPC)        │
└───────────────────────┘
```

## User Experience

### Scenario 1: Window closed mid-stream
1. **Before close**: Stream interrupted → partial saved with `metadata.partial = true`
2. **On reopen**:
   - useResumeManager initial scan detects interrupted stream
   - Checks `autoRetry === true` (user didn't press Ctrl+C)
   - Calls `resumeStream()` automatically
   - Stream continues in background
   - User sees seamless continuation

### Scenario 2: Network error during active session
1. **Stream fails**: Network error → `stream-error` event
2. **useWorkspaceAggregators**: Handles error, emits `RESUME_CHECK_REQUESTED`
3. **useResumeManager**: Receives event, checks eligibility
4. **Within 1s**: Calls `resumeStream()` (first attempt)
5. **If fails again**: Exponential backoff (2s, 4s, 8s, ...)
6. **Works in background**: User can switch workspaces, still retries

### Scenario 3: User pressed Ctrl+C
1. **User action**: Ctrl+C → `stream-abort` event
2. **AIView**: Calls `onStopAutoRetry()` → sets `autoRetry = false`
3. **On reopen**:
   - useResumeManager sees `autoRetry === false`
   - Skips this workspace (respects user intent)
   - RetryBarrier shows manual retry button
   - `[INTERRUPTED]` sentinel added to model context

### Scenario 4: Multiple workspaces interrupted
1. **State**: 3 workspaces all have partial messages with `autoRetry === true`
2. **Initial scan**: Checks all 3 workspaces
3. **Event-driven**: Each failure emits event, triggers resume check
4. **Result**: All 3 auto-retry in parallel (non-blocking)

## Benefits

✅ **Event-driven** - No polling, reacts immediately to failures  
✅ **Centralized** - All resume logic in one place, easier to maintain  
✅ **DRY** - Extracted send options helper, reused across components  
✅ **Idempotent** - Safe to call multiple times, no side effects  
✅ **Background operation** - Non-visible workspaces auto-retry  
✅ **User control** - Can disable via "Stop Auto-Retry" button  
✅ **Type-safe** - No new backend types needed  
✅ **Backwards compatible** - Works with existing localStorage structure

## Testing

Manual testing steps:
1. ✅ Start stream, close app mid-stream → reopen → verify auto-resume
2. ✅ Network error during streaming → verify background retry with exponential backoff
3. ✅ Press Ctrl+C → close app → reopen → verify manual retry barrier shows
4. ✅ Multiple workspaces with interruptions → verify all resume in parallel
5. ✅ Switch away from workspace with failure → verify background retry continues

## Technical Details

### Exponential Backoff
- Initial delay: 1 second
- Backoff formula: `delay = min(1000 * 2^attempt, 60000)`
- Sequence: 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, ...
- No max retries - continues indefinitely until success or user stops

### State Management
- `autoRetry` (localStorage): boolean - User hasn't pressed Ctrl+C
- `retryState` (localStorage): `{ attempt: number, retryStartTime: number }`
- Both per-workspace, survive app restarts

### Idempotency Checks
1. Workspace has interrupted stream? (isPartial=true)
2. autoRetry enabled? (not user-aborted)
3. Not already retrying? (prevent double-retry)
4. Backoff timer expired? (exponential delay)

All checks must pass to attempt resume.

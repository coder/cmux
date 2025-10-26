# Running the Trunk Branch Bug Test

This document describes how to run the test that demonstrates the trunk branch bug in `createWorkspace`.

## Bug Description

When creating a new workspace, the `trunkBranch` parameter should specify which branch to create the new branch from. However, in SSHRuntime, this parameter is being ignored and new branches are created from HEAD instead.

**Location of bug:** `src/runtime/SSHRuntime.ts:592` and `618`
- Line 592: `trunkBranch` is destructured as `_trunkBranch` (underscore indicates unused)
- Line 618: Branch is created from `HEAD` instead of using `trunkBranch`

## Test Location

The test is located in `tests/ipcMain/createWorkspace.test.ts` in the "Branch handling" describe block within the runtime matrix.

Test name: `"creates new branch from specified trunk branch, not from default branch"`

## Running the Test

### Prerequisites

1. Set the `TEST_INTEGRATION` environment variable to enable integration tests:
   ```bash
   export TEST_INTEGRATION=1
   ```

2. Ensure Docker is installed and running (required for SSH runtime tests)

### Run the specific test

```bash
# Run just this test for both runtimes
./node_modules/.bin/jest tests/ipcMain/createWorkspace.test.ts -t "creates new branch from specified trunk branch"
```

Or using make:
```bash
TEST_INTEGRATION=1 make test
```

## Expected Results

### LocalRuntime (PASS ✓)
The test should **PASS** for LocalRuntime because it correctly uses the `trunkBranch` parameter when creating a new branch via `git worktree add -b`.

### SSHRuntime (FAIL ✗)
The test should **FAIL** for SSHRuntime because it ignores the `trunkBranch` parameter and creates branches from `HEAD` instead.

The failure will manifest as:
- `trunk-file.txt` will NOT exist (it should exist if branch was created from custom-trunk)
- The test assertion `expect(checkOutput.trim()).toBe("exists")` will fail

## Test Scenario

The test creates the following git structure:

```
main (initial) ← custom-trunk (+ trunk-file.txt) 
                           ↑
                           Should branch from here
                           
main (initial) ← other-branch (+ other-file.txt)
                           ↑
                           HEAD might be here (bug)
```

When creating a workspace with `trunkBranch: "custom-trunk"`:
- **Expected:** New branch contains `trunk-file.txt` (from custom-trunk)
- **Actual (bug):** New branch might be from HEAD/default, missing `trunk-file.txt`

## Test Coverage

This test is part of the runtime matrix and runs for both:
- `{ type: "local" }` - LocalRuntime
- `{ type: "ssh" }` - SSHRuntime

This ensures parity between runtime implementations.

## Implementation Details

The test uses a unified approach for both runtimes:
- Uses `RUNTIME_EXEC` IPC channel to execute shell commands (works for both local and SSH)
- Avoids runtime-specific branching logic
- Uses helper function `readStream()` to read command output from ReadableStream

This approach simplifies the test and ensures the same verification logic runs for both runtimes.


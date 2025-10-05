# 🤖 Proposal: Fix Bash Tool Hanging on Interactive Editors

## Executive Summary

The bash tool hangs indefinitely when executing git commands that try to open interactive editors (e.g., `git rebase --continue`). This proposal provides a simple, comprehensive fix by setting environment variables to prevent editor launches.

---

## Problem Statement

### Issue

Commands like `git rebase --continue`, `git commit` (without `-m`), and `git merge` hang indefinitely when they attempt to open interactive editors (Vim, nano, etc.).

### Impact

- AI-driven git workflows are blocked
- Timeouts are the only escape, wasting time
- User experience is degraded

### Root Cause

The bash tool closes stdin (`stdio: ["ignore", "pipe", "pipe"]`), but git still attempts to launch editors which then wait forever for input that will never come.

---

## Proposed Solution

### Change Required

Modify `src/services/tools/bash.ts` to set environment variables that prevent interactive editors.

**One-line summary:** Change `env: process.env` to spread environment with editor-blocking variables.

### Implementation

```diff
--- a/src/services/tools/bash.ts
+++ b/src/services/tools/bash.ts
@@ -39,7 +39,14 @@
       using childProcess = new DisposableProcess(
         spawn("bash", ["-c", script], {
           cwd: config.cwd,
-          env: process.env,
+          env: {
+            ...process.env,
+            // Prevent interactive editors from blocking bash execution
+            GIT_EDITOR: "true",           // Git-specific editor (highest priority)
+            GIT_SEQUENCE_EDITOR: "true",  // For interactive rebase sequences
+            EDITOR: "true",               // General fallback for non-git commands
+            VISUAL: "true",               // Another common editor environment variable
+          },
           stdio: ["ignore", "pipe", "pipe"], // stdin: ignore, stdout: pipe, stderr: pipe
         })
       );
```

### How It Works

1. **Git checks editors in order:** `GIT_EDITOR` → `core.editor` → `VISUAL` → `EDITOR` → default
2. **We intercept early:** Set `GIT_EDITOR="true"` so git never reaches later options
3. **`true` command behavior:**
   - Receives commit message file path as argument
   - Exits immediately with code 0 (success)
   - Doesn't modify the file
4. **Git's interpretation:** "User accepted the default message"
5. **Result:** Operation continues without hanging

---

## Benefits

✅ **Fixes the hang** - Commands complete in milliseconds instead of timing out  
✅ **Minimal change** - Only 7 lines added, no logic changes  
✅ **Broad coverage** - Works for git and any other editor-launching tool  
✅ **No script changes** - Works transparently for all user scripts  
✅ **Preserves functionality** - Git operations succeed with default messages  
✅ **Fail fast** - If editor is absolutely required, command fails quickly with clear error

---

## Testing

### New Test Cases Added

Three test cases in `src/services/tools/bash.test.ts` reproduce the bug:

1. **"should not hang on git rebase --continue (regression test)"**  
   Full scenario with conflict resolution

2. **"should not hang on simple git rebase --continue"**  
   Simplified version with less setup

3. **"minimal git rebase --continue reproduction"**  
   Minimal reproduction case (most compact)

### Current Behavior (Bug Present)

```bash
$ bun test src/services/tools/bash.test.ts --test-name-pattern "git rebase" --timeout 3000

(fail) bash tool > should not hang on git rebase --continue (regression test) [3001.84ms]
  ^ this test timed out after 3000ms.
(fail) bash tool > should not hang on simple git rebase --continue [3002.26ms]
  ^ this test timed out after 3000ms.
(fail) bash tool > minimal git rebase --continue reproduction [3001.67ms]
  ^ this test timed out after 3000ms.

 0 pass, 3 fail
```

### Expected Behavior (After Fix)

All three tests should pass in < 2 seconds each.

### Verification Steps

1. Apply the fix to `src/services/tools/bash.ts`
2. Run: `bun test src/services/tools/bash.test.ts --test-name-pattern "git rebase"`
3. Verify all 3 git rebase tests pass
4. Run: `bun test` (full test suite)
5. Verify no regressions in other tests
6. Run: `bun typecheck`
7. Manual testing of git workflows

---

## Risk Analysis

### Risk: User expects to edit commit messages interactively

**Likelihood:** Low  
**Impact:** Low  
**Mitigation:**

- Bash tool is designed for automated AI operations, not interactive editing
- Users can still provide messages via `-m` flags or pre-written files
- This is the desired behavior for automation

### Risk: Some git commands fail instead of hang

**Likelihood:** Very Low  
**Impact:** Positive (fail fast is better than hang)  
**Mitigation:**

- Clear error messages guide users to add `-m` flags
- Failures are easier to debug than timeouts

### Risk: Breaking change for existing workflows

**Likelihood:** Very Low  
**Impact:** Low  
**Mitigation:**

- Most git commands already include `-m` flags for automation
- Commands that rely on interactive editing shouldn't be in AI automation workflows

---

## Alternatives Considered

### Alternative 1: Add `--no-edit` flags to git commands

**Rejected because:**

- Requires modifying user scripts
- Only works for git, not other tools
- Not all git commands support `--no-edit`

### Alternative 2: Use `GIT_EDITOR=:`

**Rejected because:**

- `:` is a shell builtin, requires `sh -c ':'`
- Less portable than `true` command
- More complex

### Alternative 3: Set `core.editor` in git config

**Rejected because:**

- Only affects specific repositories
- Requires git repo setup in each test/workspace
- Doesn't help non-git tools

### Alternative 4: Mock/intercept editor launches

**Rejected because:**

- Complex implementation
- Fragile and hard to maintain
- Environment variables are the standard solution

---

## Success Criteria

- [x] Test cases created that reproduce the bug
- [ ] All three git rebase test cases pass after fix
- [ ] No regressions in existing bash tool tests
- [ ] `bun typecheck` passes
- [ ] Manual testing confirms git workflows work
- [ ] Documentation updated (this proposal)

---

## Implementation Plan

1. **Apply the fix** (~5 minutes)
   - Modify `src/services/tools/bash.ts` per the diff above

2. **Run tests** (~2 minutes)

   ```bash
   bun test src/services/tools/bash.test.ts --test-name-pattern "git rebase"
   bun test
   bun typecheck
   ```

3. **Manual verification** (~5 minutes)
   - Test common git workflows in actual workspace
   - Verify rebase, commit, merge operations

4. **Commit** (~2 minutes)

   ```bash
   git add src/services/tools/bash.ts
   git commit -m "🤖 fix: prevent bash tool from hanging on interactive editors

   Set GIT_EDITOR, EDITOR, VISUAL, and GIT_SEQUENCE_EDITOR to 'true' to prevent
   git and other tools from launching interactive editors (vim, nano, etc.) that
   would hang waiting for user input.

   Fixes hanging on: git rebase --continue, git commit, git merge, and similar
   operations that normally require editor interaction.

   Generated with cmux"
   ```

**Total time estimate:** ~15 minutes

---

## References

- Test file: `src/services/tools/bash.test.ts` (lines 249-376)
- Implementation file: `src/services/tools/bash.ts` (lines 39-45)
- Git editor documentation: https://git-scm.com/docs/git-var#Documentation/git-var.txt-GITEDITOR
- `true` command: POSIX standard utility, available on all Unix-like systems

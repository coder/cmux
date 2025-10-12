# CI and Build System Optimization Plan

**Goal:** Reduce CI/build times while improving developer experience and maintainability.

**Current State:**
- CI runtime: ~3 minutes (static-check, test, integration-test jobs)
- Build runtime: ~3.5 minutes (macOS, Linux builds)
- No dependency caching in CI workflows
- Redundant dependency installations across jobs
- Sequential typecheck runs

---

## 🍎 Low-Hanging Fruit (Immediate Wins)

### 1. **Cache Bun Dependencies** ⭐ TOP PRIORITY

**Impact:** Save 30-60s per job (3 jobs = 90-180s total)

**Current:** Every CI job runs `bun install --frozen-lockfile` from scratch
- `static-check` job
- `test` job  
- `integration-test` job

**Fix:** Add bun cache action to all workflows

```yaml
- name: Setup Bun
  uses: oven-sh/setup-bun@v2
  with:
    bun-version: latest

- name: Cache bun dependencies
  uses: actions/cache@v4
  with:
    path: ~/.bun/install/cache
    key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
    restore-keys: |
      ${{ runner.os }}-bun-

- name: Install dependencies
  run: bun install --frozen-lockfile
```

**Applies to:**
- `.github/workflows/ci.yml` (all 3 jobs)
- `.github/workflows/build.yml` (both jobs)

**Effort:** 15 minutes  
**Risk:** Very low  
**Expected Savings:** 90-180s total across CI jobs

---

### 2. **Deduplicate Typecheck Runs** ⭐ HIGH PRIORITY

**Impact:** Save 10-20s per static-check run

**Current:** Running typecheck twice unnecessarily
- `scripts/lint.sh` calls `scripts/typecheck.sh` at line 33
- `Makefile` target `static-check` runs lint AND typecheck separately
- CI runs `make -j3 static-check` which parallelizes them, but lint internally calls typecheck anyway

**Problem:** When running `make static-check`, we get:
1. `make lint` → calls `scripts/lint.sh` → calls `scripts/typecheck.sh` 
2. `make typecheck` → calls `scripts/typecheck.sh` directly
3. `make fmt-check` runs separately

So typecheck runs TWICE.

**Fix Option A - Simplest (Recommended):**
Remove typecheck call from `lint.sh`:

```bash
# scripts/lint.sh - Remove line 33:
# ./scripts/typecheck.sh   # DELETE THIS LINE
```

Let `Makefile` handle orchestration. The `static-check` target already runs them separately with parallelism.

**Fix Option B - Alternative:**
Keep lint self-contained but add a flag:

```bash
# scripts/lint.sh
if [ "$SKIP_TYPECHECK" != "1" ]; then
  ./scripts/typecheck.sh
fi
```

Then in Makefile: `SKIP_TYPECHECK=1 ./scripts/lint.sh`

**Recommendation:** Option A is cleaner. The Makefile is already the orchestrator.

**Effort:** 5 minutes  
**Risk:** Very low  
**Expected Savings:** 10-20s per CI run

---

### 3. **Cache TypeScript Build Info** ⭐ MEDIUM PRIORITY

**Impact:** Save 10-30s on incremental builds

**Current:** No `.tsbuildinfo` caching between CI runs

**Fix:** Enable incremental compilation and cache build info

```typescript
// tsconfig.json additions
{
  "compilerOptions": {
    // ... existing options
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}

// tsconfig.main.json additions  
{
  "compilerOptions": {
    // ... existing options
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo.main"
  }
}
```

```yaml
# In CI workflows
- name: Cache TypeScript build info
  uses: actions/cache@v4
  with:
    path: |
      .tsbuildinfo
      .tsbuildinfo.main
    key: ${{ runner.os }}-tsbuildinfo-${{ hashFiles('src/**/*.ts', 'src/**/*.tsx', 'tsconfig*.json') }}
    restore-keys: |
      ${{ runner.os }}-tsbuildinfo-
```

**Effort:** 20 minutes  
**Risk:** Low (cache invalidation on source changes)  
**Expected Savings:** 10-30s on subsequent runs

---

### 4. **Optimize Static Check Parallelism**

**Impact:** Save 5-15s by better job scheduling

**Current:** `make -j3 static-check` runs 3 tasks in parallel:
- `lint` (fastest, but calls typecheck internally - waste!)
- `typecheck` (medium)
- `fmt-check` (fastest)

**After fixing #2 above:**
- `lint` (medium)
- `typecheck` (medium) 
- `fmt-check` (fast)

**Optimization:** The bottleneck is typecheck (runs twice). After #2 is fixed, verify parallelism is optimal.

**Measurement:** Add timing to CI:

```yaml
- name: Run static checks
  run: time make -j3 static-check
```

**Effort:** 5 minutes  
**Risk:** None (just measurement)  
**Expected Savings:** Already captured in #2

---

### 5. **Cache shfmt Binary**

**Impact:** Save 3-5s per CI run

**Current:** Downloads and installs shfmt every time

```yaml
- name: Install shfmt
  run: |
    curl -sS https://webinstall.dev/shfmt | bash
    echo "$HOME/.local/bin" >> $GITHUB_PATH
```

**Fix:** Cache the binary

```yaml
- name: Cache shfmt
  id: cache-shfmt
  uses: actions/cache@v4
  with:
    path: ~/.local/bin/shfmt
    key: ${{ runner.os }}-shfmt-3.8.0  # Pin version
    restore-keys: |
      ${{ runner.os }}-shfmt-

- name: Install shfmt
  if: steps.cache-shfmt.outputs.cache-hit != 'true'
  run: |
    curl -sS https://webinstall.dev/shfmt | bash
    
- name: Add shfmt to PATH
  run: echo "$HOME/.local/bin" >> $GITHUB_PATH
```

**Effort:** 10 minutes  
**Risk:** Very low  
**Expected Savings:** 3-5s per CI run

---

## 🎯 Medium-Hanging Fruit (Moderate Effort, Good ROI)

### 6. **Share Dependencies Across Jobs (Matrix Strategy)**

**Impact:** Save time by reusing dependency installation

**Current:** Each job installs dependencies independently

**Fix:** Use a setup job or matrix strategy to install once, upload cache

```yaml
jobs:
  setup:
    runs-on: ubuntu-latest-8-cores
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Cache bun dependencies
        uses: actions/cache@v4
        # ... cache config
      - run: bun install --frozen-lockfile
      
  static-check:
    needs: setup
    # ... rest
    
  test:
    needs: setup
    # ... rest
```

**Caveat:** Adds job orchestration overhead (10-20s). Net gain depends on cache hit rate.

**Effort:** 30 minutes  
**Risk:** Medium (job dependencies add latency)  
**Expected Savings:** 30-60s if cache hit rate is high

**Recommendation:** Implement caching first (#1), measure hit rate, then decide on this optimization.

---

### 7. **Optimize ESLint Configuration**

**Impact:** Save 5-10s on lint runs

**Current:** ESLint processes `src/**/*.{ts,tsx}` (153 files)

**Optimizations:**

**a) Cache ESLint results:**

```yaml
- name: Cache ESLint
  uses: actions/cache@v4
  with:
    path: .eslintcache
    key: ${{ runner.os }}-eslint-${{ hashFiles('src/**/*.ts', 'src/**/*.tsx', '.eslintrc*') }}
```

```json
// package.json or .eslintrc
{
  "cache": true,
  "cacheLocation": ".eslintcache"
}
```

**b) Use ESLint's `--cache` flag:**

```bash
# scripts/lint.sh
bun x eslint "$ESLINT_PATTERN" --cache
```

**Effort:** 15 minutes  
**Risk:** Low  
**Expected Savings:** 5-10s per run

---

### 8. **Optimize Prettier Checks**

**Impact:** Save 3-5s on fmt-check

**Current:** Checks all patterns, outputs to stderr (captured and filtered)

**Fix:** Use Prettier's `--cache` flag

```bash
# Makefile fmt-check target
fmt-check: ## Check code formatting
	@echo "Checking TypeScript/JSON/Markdown formatting..."
	@bun x prettier --check --cache $(PRETTIER_PATTERNS)
```

Add cache directory to `.gitignore`:
```gitignore
.prettiercache
```

**Effort:** 5 minutes  
**Risk:** Very low  
**Expected Savings:** 3-5s per run

---

### 9. **Reduce Test Fixture Setup Time**

**Impact:** Save 5-15s on test runs

**Current:** Integration tests may be creating/destroying test fixtures repeatedly

**Investigation needed:**
- Profile test suite: `bun test --coverage` or add timing
- Check if integration tests share fixtures or recreate them

**Potential optimizations:**
- Share test fixtures across tests where safe
- Use in-memory filesystems for test isolation
- Lazy-load expensive test data

**Effort:** 1-2 hours (investigation + implementation)  
**Risk:** Medium (test isolation is critical)  
**Expected Savings:** 5-15s per test run

---

## 🔮 Advanced Optimizations (Longer-Term)

### 10. **Split Static Checks into Separate Jobs**

**Impact:** Better visibility, potential parallelism

**Current:** Single `static-check` job runs all checks serially with `-j3`

**Alternative:** Split into separate jobs

```yaml
jobs:
  lint:
    name: Lint
    # ...
    
  typecheck:
    name: Typecheck
    # ...
    
  format-check:
    name: Format Check
    # ...
```

**Pros:**
- Better failure visibility (know which check failed)
- Can use different runner sizes
- Can skip jobs based on changed files

**Cons:**
- More dependency installations (unless using setup job)
- More runner overhead
- Takes longer if run sequentially

**Recommendation:** Only if we implement dependency sharing (#6) or caching is very effective (#1)

**Effort:** 1 hour  
**Risk:** Low  
**Expected Savings:** Better UX, similar or slightly worse performance

---

### 11. **Conditional Job Execution (Path Filters)**

**Impact:** Skip unnecessary jobs based on changed files

**Example:** Don't run integration tests if only docs changed

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      src: ${{ steps.filter.outputs.src }}
      docs: ${{ steps.filter.outputs.docs }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v2
        id: filter
        with:
          filters: |
            src:
              - 'src/**'
              - 'tests/**'
              - 'package.json'
              - 'tsconfig*.json'
            docs:
              - 'docs/**'

  test:
    needs: changes
    if: needs.changes.outputs.src == 'true'
    # ...
```

**Effort:** 1-2 hours  
**Risk:** Low (but adds complexity)  
**Expected Savings:** Skip entire jobs on doc-only changes

---

### 12. **Use Turborepo or Nx for Monorepo Caching**

**Impact:** Sophisticated caching across tasks

**Context:** This is a single-package repo, not a monorepo

**Consideration:** Turborepo/Nx add dependency caching and task orchestration

**Pros:**
- Smart caching of task outputs
- Better parallelization
- Remote cache support

**Cons:**
- Significant setup overhead
- Overkill for single-package project
- Adds complexity

**Recommendation:** NOT RECOMMENDED for current project size

---

### 13. **Self-Hosted Runners with Persistent Caches**

**Impact:** Much faster dependency installation

**Context:** Using GitHub-hosted `ubuntu-latest-8-cores` runners

**Alternative:** Self-hosted runners with persistent `node_modules`

**Pros:**
- Near-instant dependency installation after first run
- Persistent build caches
- Can be more cost-effective at scale

**Cons:**
- Infrastructure overhead
- Maintenance burden
- Security considerations

**Recommendation:** Consider only if CI time becomes critical bottleneck

---

## 📊 Prioritized Implementation Order

### Phase 1: Immediate Wins (1 hour total)
1. ✅ **Cache Bun dependencies** (#1) - 15 min - **Save 90-180s**
2. ✅ **Deduplicate typecheck** (#2) - 5 min - **Save 10-20s**
3. ✅ **Cache shfmt binary** (#5) - 10 min - **Save 3-5s**
4. ✅ **Add Prettier cache** (#8) - 5 min - **Save 3-5s**
5. ✅ **Add ESLint cache** (#7) - 15 min - **Save 5-10s**

**Total Phase 1 Savings: 111-220 seconds (1.8-3.7 minutes)**

### Phase 2: TypeScript Optimization (30 min)
6. ✅ **Cache TypeScript build info** (#3) - 20 min - **Save 10-30s**

### Phase 3: Measurement & Validation (15 min)
7. ✅ **Add timing instrumentation** - Measure actual improvements
8. ✅ **Verify parallelism is optimal** (#4)

### Phase 4: Consider if Phase 1-3 aren't enough
9. Test suite profiling (#9)
10. Dependency sharing strategy (#6)
11. Path-based job filtering (#11)

---

## 🔧 Implementation Checklist

### Static Check Optimizations
- [ ] Add bun cache to `ci.yml` static-check job
- [ ] Add shfmt binary cache to `ci.yml`
- [ ] Remove duplicate typecheck call from `scripts/lint.sh`
- [ ] Enable ESLint caching in config
- [ ] Enable Prettier caching in Makefile
- [ ] Add TypeScript incremental compilation
- [ ] Cache `.tsbuildinfo` files in CI

### Test Optimizations  
- [ ] Add bun cache to `ci.yml` test job
- [ ] Add bun cache to `ci.yml` integration-test job
- [ ] Profile test suite for bottlenecks
- [ ] Optimize test fixture setup if needed

### Build Optimizations
- [ ] Add bun cache to `build.yml` macOS job
- [ ] Add bun cache to `build.yml` Linux job
- [ ] Cache TypeScript build artifacts between build steps

### Measurement
- [ ] Add `time` command to static-check step
- [ ] Add `time` command to test steps
- [ ] Monitor cache hit rates in Actions UI
- [ ] Document before/after times

---

## 📈 Expected Results

### Before Optimization
- CI (static-check + test + integration): **~3 minutes**
- Build (macOS + Linux): **~3.5 minutes**

### After Phase 1 (Immediate Wins)
- CI: **~1.5-2 minutes** (40-50% faster)
- Build: **~2-2.5 minutes** (30-40% faster)

### After Phase 2 (TypeScript Optimization)
- CI: **~1.3-1.8 minutes** (additional 10-15% improvement)
- Build: **~1.8-2.2 minutes** (additional 10-15% improvement)

### Success Metrics
- ✅ CI runtime < 2 minutes (66% of current)
- ✅ Build runtime < 2.5 minutes (71% of current)
- ✅ Cache hit rate > 80% for dependencies
- ✅ No degradation in test reliability
- ✅ Developer experience improved (faster `make` commands)

---

## 🚨 Risks & Mitigations

### Cache Invalidation Bugs
**Risk:** Stale caches cause incorrect builds  
**Mitigation:** 
- Use precise cache keys (hash lockfile, source files)
- Add restore-keys fallback
- Monitor for flaky tests after caching changes

### False Sense of Speed
**Risk:** Fast CI due to cache hits, slow on cache misses  
**Mitigation:**
- Measure both cache hit and miss scenarios
- Ensure cache miss time is acceptable
- Don't over-optimize for hot paths

### Job Parallelism Overhead  
**Risk:** Splitting jobs adds coordination overhead  
**Mitigation:**
- Only split if there's clear benefit
- Measure end-to-end time, not just individual job time
- Keep related checks together

### TypeScript Incremental Build Issues
**Risk:** `.tsbuildinfo` can become corrupted  
**Mitigation:**
- Cache with source file hash
- Easy to delete and rebuild
- Already used in local dev

---

## 🎯 Next Steps

1. **Start with Phase 1** - Implement all 5 quick wins in single PR
2. **Measure results** - Compare CI run times before/after
3. **Implement Phase 2** - Add TypeScript caching
4. **Reassess** - If < 2 min, stop. If not, move to Phase 4

**Estimated total implementation time: 1.5-2 hours**  
**Expected CI time reduction: 40-60%**

---

## 📝 Notes

- All optimizations maintain backward compatibility with local dev
- Caching strategy is conservative (easy to invalidate)
- Focus on low-risk, high-impact changes first
- Can roll back any change independently



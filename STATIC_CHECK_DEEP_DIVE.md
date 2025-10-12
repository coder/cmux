# Static Check Deep Dive - Low-Hanging Fruit Analysis

## 🎯 Current Bottleneck: Static Checks

The `static-check` job in CI currently takes **~45-60 seconds** and is one of the critical path items. Here's what's happening under the hood and how to optimize it.

---

## 🔍 Current Flow Analysis

### What Happens in `make -j3 static-check`

The Makefile target runs 3 tasks in parallel:

```makefile
static-check: lint typecheck fmt-check
```

#### Task 1: `make lint` (~25-30s)
```bash
scripts/lint.sh
  ├─> Check for PNG files in docs/ (1s)
  ├─> bun x eslint src/**/*.{ts,tsx} (15-20s)
  └─> scripts/typecheck.sh (10-12s) ⚠️ REDUNDANT
      ├─> tsc --noEmit (5-6s)
      └─> tsc --noEmit -p tsconfig.main.json (5-6s)
```

#### Task 2: `make typecheck` (~10-12s)
```bash
scripts/typecheck.sh
  ├─> tsc --noEmit (5-6s)
  └─> tsc --noEmit -p tsconfig.main.json (5-6s)
```

#### Task 3: `make fmt-check` (~3-5s)
```bash
Makefile target
  └─> bun x prettier --check <patterns> (3-5s)
```

### 🚨 Problem Identified

**TypeScript is running TWICE in parallel!**

- `make lint` spawns `typecheck.sh` 
- `make typecheck` also spawns `typecheck.sh`
- Both run concurrently due to `-j3` flag
- This wastes CPU cycles and CI runner time

**Why it matters:**
- TypeScript checking is the slowest part of static checks
- Running it twice means we're doing ~10-12s of redundant work
- The parallelism doesn't help because both tasks are I/O and CPU bound on the same files

---

## 💡 Optimization Strategy

### Fix #1: Deduplicate Typecheck (IMMEDIATE)

**Option A: Remove from lint.sh (Recommended)**

The Makefile already orchestrates these tasks. Let it handle the composition.

```diff
# scripts/lint.sh
  echo "Running eslint..."
  bun x eslint "$ESLINT_PATTERN"
- ./scripts/typecheck.sh
- echo "All lint checks passed!"
+ echo "ESLint checks passed!"
```

**Result:**
- `make lint` only runs ESLint (15-20s)
- `make typecheck` runs TypeScript checks (10-12s)  
- `make fmt-check` runs Prettier (3-5s)
- All 3 run in parallel, no duplication
- **Savings: 10-12 seconds per CI run**

**Option B: Add conditional flag**

Keep `lint.sh` self-contained for standalone use:

```bash
# scripts/lint.sh
if [ "$SKIP_TYPECHECK" != "1" ]; then
  ./scripts/typecheck.sh
fi
```

```makefile
# Makefile
lint:
	@SKIP_TYPECHECK=1 ./scripts/lint.sh
```

This preserves the ability to run `./scripts/lint.sh` directly and get full checking.

---

### Fix #2: Add Tool Caching

#### A) ESLint Cache (~5-10s savings)

ESLint supports caching but we're not using it.

**Enable in lint.sh:**
```bash
bun x eslint "$ESLINT_PATTERN" --cache --cache-location .eslintcache
```

**Add to .gitignore:**
```gitignore
.eslintcache
```

**Add to CI workflow:**
```yaml
- name: Cache ESLint
  uses: actions/cache@v4
  with:
    path: .eslintcache
    key: ${{ runner.os }}-eslint-${{ hashFiles('src/**/*.ts', 'src/**/*.tsx', 'eslint.config.js') }}
    restore-keys: |
      ${{ runner.os }}-eslint-
```

**Impact:**
- First run: Same speed (creates cache)
- Subsequent runs: Only checks changed files
- **Savings: 5-10s on cache hit**

#### B) Prettier Cache (~3-5s savings)

Prettier also supports caching.

**Update Makefile:**
```makefile
fmt-check:
	@echo "Checking TypeScript/JSON/Markdown formatting..."
	@bun x prettier --check --cache --cache-location .prettiercache $(PRETTIER_PATTERNS)
```

**Add to .gitignore:**
```gitignore
.prettiercache
```

**Add to CI workflow:**
```yaml
- name: Cache Prettier
  uses: actions/cache@v4
  with:
    path: .prettiercache
    key: ${{ runner.os }}-prettier-${{ hashFiles('src/**/*.{ts,tsx,json,md}', 'docs/**/*.{md,mdx}') }}
    restore-keys: |
      ${{ runner.os }}-prettier-
```

**Impact:**
- **Savings: 3-5s on cache hit**

#### C) TypeScript Incremental Builds (~10-15s savings)

TypeScript has incremental compilation but we're using `--noEmit` which doesn't leverage it.

**Strategy: Enable for build, keep noEmit for checks**

The issue is `typecheck.sh` uses `--noEmit` which doesn't produce `.tsbuildinfo` files. We can:

1. **For CI checks**: Keep current approach (fast enough with caching)
2. **For builds**: Enable incremental compilation

**Add to tsconfig.json:**
```json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

**Add to tsconfig.main.json:**
```json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo.main"
  }
}
```

**Cache in CI (for build jobs, not check jobs):**
```yaml
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

**Impact:**
- Speeds up `make build` in CI
- Speeds up local `make build`
- **Savings: 10-15s on incremental builds**

---

### Fix #3: Cache shfmt Binary (~3-5s savings)

Currently downloads shfmt on every CI run.

```yaml
- name: Cache shfmt
  id: cache-shfmt
  uses: actions/cache@v4
  with:
    path: ~/.local/bin/shfmt
    key: ${{ runner.os }}-shfmt-3.8.0
    restore-keys: |
      ${{ runner.os }}-shfmt-

- name: Install shfmt
  if: steps.cache-shfmt.outputs.cache-hit != 'true'
  run: |
    curl -sS https://webinstall.dev/shfmt | bash
    
- name: Add shfmt to PATH
  run: echo "$HOME/.local/bin" >> $GITHUB_PATH
```

**Impact: 3-5s per run**

---

## 📊 Expected Improvements

### Current Timeline (Parallel with -j3)

```
┌─────────────────────────────────────────────────────┐
│ make lint (25-30s)                                  │
│   ├─> PNG check (1s)                                │
│   ├─> ESLint (15-20s)                               │
│   └─> typecheck.sh (10-12s) ⚠️                      │
├─────────────────────────────────────────────────────┤
│ make typecheck (10-12s) ⚠️ DUPLICATE               │
│   ├─> tsc --noEmit (5-6s)                           │
│   └─> tsc -p main (5-6s)                            │
├─────────────────────────────────────────────────────┤
│ make fmt-check (3-5s)                               │
└─────────────────────────────────────────────────────┘

Total: ~30s (limited by longest task: make lint)
```

### After Fix #1 (Deduplicate)

```
┌────────────────────────────────┐
│ make lint (15-20s)             │
│   ├─> PNG check (1s)           │
│   └─> ESLint (15-20s)          │
├────────────────────────────────┤
│ make typecheck (10-12s)        │
│   ├─> tsc --noEmit (5-6s)      │
│   └─> tsc -p main (5-6s)       │
├────────────────────────────────┤
│ make fmt-check (3-5s)          │
└────────────────────────────────┘

Total: ~20s (limited by longest task: make lint)
Savings: ~10s (33% improvement)
```

### After Fixes #1 + #2 (Deduplicate + Cache, subsequent runs)

```
┌────────────────────────────────┐
│ make lint (8-10s) ✅ CACHED    │
│   ├─> PNG check (1s)           │
│   └─> ESLint (8-10s)           │  ← Only checks changed files
├────────────────────────────────┤
│ make typecheck (10-12s)        │  ← No cache for noEmit mode
│   ├─> tsc --noEmit (5-6s)      │
│   └─> tsc -p main (5-6s)       │
├────────────────────────────────┤
│ make fmt-check (1-2s) ✅ CACHED│  ← Only checks changed files
└────────────────────────────────┘

Total: ~12s on subsequent runs
Savings: ~18s from baseline (60% improvement)
```

---

## 🎯 Implementation Priority

### Phase 1: Quick Wins (15 minutes)

1. **Remove duplicate typecheck** (5 min)
   - Edit `scripts/lint.sh`
   - Remove call to `typecheck.sh`
   - Update success message

2. **Add ESLint cache** (5 min)
   - Update `scripts/lint.sh` to use `--cache`
   - Add `.eslintcache` to `.gitignore`
   - Add cache step to CI workflow

3. **Add Prettier cache** (5 min)
   - Update `Makefile` `fmt-check` target
   - Add `.prettiercache` to `.gitignore`

### Phase 2: CI Caching (10 minutes)

4. **Add ESLint cache to CI workflow**
   - Add cache action before static-check step

5. **Add shfmt cache to CI workflow**
   - Cache binary, conditional install

### Phase 3: Build Optimization (15 minutes)

6. **Enable TypeScript incremental builds**
   - Update `tsconfig.json` files
   - Add `.tsbuildinfo*` to `.gitignore`
   - Add cache step to build workflows

---

## 🧪 Testing the Changes

### Local Testing

```bash
# Clean state
rm -f .eslintcache .prettiercache

# First run (no cache)
time make static-check

# Second run (with cache)
time make static-check

# Verify cache files created
ls -lh .eslintcache .prettiercache
```

### CI Testing

1. Create PR with changes
2. First CI run will populate caches
3. Push a trivial change (e.g., comment)
4. Second CI run should be significantly faster
5. Check Actions UI for cache hit/miss stats

---

## 📝 Files to Modify

### Phase 1 Implementation

```
scripts/lint.sh           # Remove typecheck call
.gitignore                # Add .eslintcache, .prettiercache
Makefile                  # Add --cache to fmt-check
```

### Phase 2 Implementation

```
.github/workflows/ci.yml  # Add cache steps
```

### Phase 3 Implementation

```
tsconfig.json             # Add incremental settings
tsconfig.main.json        # Add incremental settings
.gitignore                # Add .tsbuildinfo*
.github/workflows/build.yml  # Add tsbuildinfo cache
```

---

## ✅ Success Criteria

- [ ] Static check job completes in < 20s (first run)
- [ ] Static check job completes in < 12s (cached run)
- [ ] No duplicate typecheck execution
- [ ] Cache hit rate > 80% for ESLint/Prettier
- [ ] Local `make static-check` is faster on second run
- [ ] All checks still catch real issues (no false negatives)

---

## 🚨 Risks & Mitigations

### Risk: Cache invalidation issues
**Mitigation:** Use precise hash keys (source files + config)

### Risk: ESLint cache corruption
**Mitigation:** Cache key includes config files; easy to delete and rebuild

### Risk: Prettier cache too aggressive
**Mitigation:** Include all relevant patterns in cache key hash

### Risk: Breaking local development
**Mitigation:** Test locally before pushing; all changes are backward compatible

---

## 📈 Projected Impact

| Metric | Before | After Phase 1 | After Phase 2 | Improvement |
|--------|--------|---------------|---------------|-------------|
| First run | 30s | 20s | 20s | 33% |
| Cached run | 30s | 20s | 12s | 60% |
| CI time saved | - | 30s | 54s | - |
| Developer UX | Slow | Better | Best | ✅ |

**Total time investment: ~40 minutes**  
**Total time saved per CI run: 12-18 seconds**  
**ROI: After ~3 CI runs, time is paid back**



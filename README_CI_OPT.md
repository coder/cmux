# CI Optimization Branch

**Branch:** `ci-opt`  
**Goal:** Reduce CI/build times by 40-60%  
**Focus:** Low-hanging fruit, especially static checks

---

## 🎯 Quick Summary

### Current State
- **CI time:** ~3 minutes (static-check, test, integration-test)
- **Build time:** ~3.5 minutes (macOS + Linux)
- **Main issues:**
  - No dependency caching
  - Duplicate typecheck execution (10-12s waste)
  - No tool result caching (ESLint, Prettier)

### Target State
- **CI time:** ~1.5-2 minutes (33-50% faster)
- **Build time:** ~2-2.5 minutes (29-43% faster)
- **Improvements:**
  - Bun dependency caching (save 90-180s total)
  - Remove duplicate typecheck (save 10-20s)
  - Tool caching for ESLint/Prettier (save 8-15s)
  - shfmt binary caching (save 3-5s)

---

## 📚 Documents

### 1. [CI_OPTIMIZATION_PLAN.md](./CI_OPTIMIZATION_PLAN.md)
**Comprehensive optimization roadmap**
- All identified optimizations (low, medium, advanced)
- Detailed implementation strategies
- Risk assessment and mitigations
- Expected ROI calculations

**Read this for:** Complete overview of optimization opportunities

---

### 2. [STATIC_CHECK_DEEP_DIVE.md](./STATIC_CHECK_DEEP_DIVE.md)
**Detailed analysis of static check bottlenecks**
- Flow analysis showing duplicate typecheck
- Tool-by-tool optimization strategies
- Timeline diagrams showing improvements
- Testing procedures

**Read this for:** Understanding the duplicate typecheck issue and how to fix it

---

### 3. [IMPLEMENTATION_TRACKING.md](./IMPLEMENTATION_TRACKING.md)
**Phase-by-phase implementation checklist**
- Detailed task breakdowns
- Progress tracking
- Baseline measurements
- Success metrics

**Read this for:** Step-by-step implementation guide

---

## 🚀 Quick Start - Implement Phase 1

### Prerequisites
```bash
git checkout ci-opt
```

### 1. Fix Duplicate Typecheck (5 min)

**File:** `scripts/lint.sh`

Remove line 33:
```bash
./scripts/typecheck.sh  # DELETE THIS LINE
```

Change success message:
```bash
echo "ESLint checks passed!"  # Was "All lint checks passed!"
```

**Test:**
```bash
time make static-check
# Should be ~10s faster than before
```

---

### 2. Add Bun Caching (15 min)

**File:** `.github/workflows/ci.yml`

Add after "Setup Bun" step in all 3 jobs:

```yaml
- name: Cache bun dependencies
  uses: actions/cache@v4
  with:
    path: ~/.bun/install/cache
    key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
    restore-keys: |
      ${{ runner.os }}-bun-
```

**File:** `.github/workflows/build.yml`

Add the same cache step to both macOS and Linux jobs.

---

### 3. Add Tool Caching (20 min)

#### a) ESLint Cache

**File:** `scripts/lint.sh`
```bash
bun x eslint "$ESLINT_PATTERN" --cache --cache-location .eslintcache
```

**File:** `.gitignore`
```gitignore
.eslintcache
```

**File:** `.github/workflows/ci.yml` (in static-check job)
```yaml
- name: Cache ESLint
  uses: actions/cache@v4
  with:
    path: .eslintcache
    key: ${{ runner.os }}-eslint-${{ hashFiles('src/**/*.ts', 'src/**/*.tsx', 'eslint.config.js') }}
    restore-keys: |
      ${{ runner.os }}-eslint-
```

#### b) Prettier Cache

**File:** `Makefile`
```makefile
fmt-check: ## Check code formatting
	@echo "Checking TypeScript/JSON/Markdown formatting..."
	@bun x prettier --check --cache --cache-location .prettiercache $(PRETTIER_PATTERNS)
```

**File:** `.gitignore`
```gitignore
.prettiercache
```

#### c) shfmt Cache

**File:** `.github/workflows/ci.yml` (in static-check job)

Replace the "Install shfmt" step with:
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

---

### 4. Test Locally

```bash
# Clean state
rm -f .eslintcache .prettiercache

# First run (no cache)
time make static-check

# Second run (with cache)
time make static-check

# Should see 8-15s improvement on second run
```

---

### 5. Create PR and Measure

```bash
git add -A
git commit -m "🤖 Optimize CI: Add caching and fix duplicate typecheck

- Remove duplicate typecheck from lint.sh (save 10-20s)
- Add bun dependency caching (save 90-180s across jobs)
- Add ESLint/Prettier caching (save 8-15s)
- Add shfmt binary caching (save 3-5s)

Expected total savings: 111-220s per CI run

Generated with \`cmux\`"

git push origin ci-opt
gh pr create --title "🤖 Optimize CI and build system" \
  --body "See CI_OPTIMIZATION_PLAN.md for details.

## Changes
- [x] Remove duplicate typecheck execution
- [x] Add bun dependency caching
- [x] Add ESLint/Prettier caching
- [x] Add shfmt binary caching

## Expected Impact
- CI time: 3min → 1.5-2min (40-50% faster)
- Build time: 3.5min → 2-2.5min (30-40% faster)

## Testing
- Local static-check runs 8-15s faster on second run
- All checks still pass correctly

_Generated with \`cmux\`_"
```

---

## 📊 Expected Results

### Before Optimization
```
CI Job Times:
├─ static-check: 45-60s
├─ test: 30-40s
└─ integration-test: 90-120s
Total: ~3 min (parallel)

Build Job Times:
├─ macOS: 180-210s
└─ Linux: 150-180s
Total: ~3.5 min (parallel)
```

### After Phase 1
```
CI Job Times (first run):
├─ static-check: 20-30s ⚡ 25-30s saved
├─ test: 20-25s ⚡ 10-15s saved
└─ integration-test: 60-90s ⚡ 30s saved
Total: ~1.5-2 min (parallel)

CI Job Times (cached run):
├─ static-check: 12-15s ⚡ 33-45s saved
├─ test: 15-20s ⚡ 15-20s saved
└─ integration-test: 50-80s ⚡ 40s saved
Total: ~1-1.5 min (parallel)
```

---

## 🎯 Success Criteria

- [ ] Static check completes in < 20s (first run)
- [ ] Static check completes in < 12s (cached run)
- [ ] No duplicate typecheck execution
- [ ] Cache hit rate > 80%
- [ ] All checks still catch real issues
- [ ] Local dev is faster

---

## 🔍 Verification Commands

```bash
# Check for duplicate typecheck
make static-check 2>&1 | grep -c "typecheck"  # Should be 1, not 2

# Check cache files exist locally
ls -lh .eslintcache .prettiercache

# Time static checks
time make static-check

# Check CI cache hit rates
gh run view --log | grep "Cache restored"
```

---

## 📝 Implementation Phases

### Phase 1: Immediate Wins ⚡ START HERE
- **Time:** ~40 minutes
- **Savings:** 111-220 seconds per CI run
- **Risk:** Very low
- **Status:** Ready to implement

### Phase 2: TypeScript Optimization
- **Time:** ~30 minutes
- **Savings:** Additional 10-30s on builds
- **Risk:** Low
- **Status:** Optional (only if Phase 1 isn't enough)

### Phase 3: Measurement & Validation
- **Time:** ~15 minutes
- **Risk:** None
- **Status:** Do this after Phase 1

---

## 🐛 Troubleshooting

### "ESLint cache seems broken"
```bash
rm .eslintcache
make static-check
```

### "Prettier cache not working"
```bash
rm .prettiercache
make fmt-check
```

### "TypeScript is still slow"
That's expected. TypeScript checking doesn't benefit from caching in `--noEmit` mode. The savings come from ESLint/Prettier caching and removing duplication.

### "Cache hit rate is low in CI"
- Check that cache keys include correct file hashes
- Verify `bun.lockb` hasn't changed
- Some cache misses are expected when source files change

---

## 📚 Additional Reading

- [GitHub Actions Caching](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)
- [ESLint Caching](https://eslint.org/docs/latest/use/command-line-interface#caching)
- [Prettier --cache flag](https://prettier.io/docs/en/cli.html#--cache)
- [TypeScript Incremental Compilation](https://www.typescriptlang.org/docs/handbook/project-references.html#build-mode-for-typescript)

---

## 💡 Tips

1. **Test locally first** - Verify caching works before pushing to CI
2. **Measure everything** - Use `time` command to verify improvements
3. **Check cache keys** - Make sure they invalidate when needed
4. **Monitor CI runs** - Watch first few runs for cache population
5. **Document results** - Update IMPLEMENTATION_TRACKING.md with actual times

---

**Ready to start?** → Jump to [Quick Start](#-quick-start---implement-phase-1)

**Want more details?** → Read [CI_OPTIMIZATION_PLAN.md](./CI_OPTIMIZATION_PLAN.md)

**Having issues?** → Check [Troubleshooting](#-troubleshooting)

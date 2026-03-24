# CI Health Report — 2026-03-24

## Summary
- **Main CI (unit tests + lint + typecheck):** ✅ GREEN after auto-fix
- **Perf Nightly:** ❌ FAILING (chronic, 5+ days)

---

## Auto-Fix Applied: Unit Test Suite (PR-like commit b1132fbe)

### Root Cause
The vitest test environment had no alias for `next/link` or `next/dynamic`.
The local `node_modules/next` install is incomplete (missing `link.js`, `dynamic.js`,
`package.json`), so 14 test files that import next/link would fail with module
resolution errors at file level, silently hiding the tests inside.

A secondary bug was found in `investments/[investmentId]/page.test.tsx`:
`vi.mock("next/navigation")` was returning `useRouter: () => ({ replace: mockFn })`
which creates a **new router object on every render**. Since `setQueryParams` is
a `useCallback` depending on `[router, searchParams]`, it changed identity every
render. This re-triggered the data-fetch `useEffect`, calling `setLoadingBase(true)`
and resetting the page to loading state mid-test — causing "View Lineage" to
disappear immediately after the actions dropdown opened.

### Files Changed
1. `repo-b/src/test/mocks/next-link.tsx` — NEW: renders `<a href>` with `preventDefault`
2. `repo-b/src/test/mocks/next-dynamic.tsx` — NEW: returns null-rendering placeholder
3. `repo-b/vitest.config.ts` — aliases `next/link` and `next/dynamic` to mock files
4. `repo-b/src/app/lab/env/[envId]/re/investments/[investmentId]/page.test.tsx`:
   - Stable router: `const stableRouter = { replace: mockRouterReplace }` (hoisted outside mock)
   - Use `userEvent.setup()` instead of `fireEvent.click` for consistent event dispatch

### Test Result After Fix
```
Test Files  58 passed (58)
Tests  175 passed (175)
```

---

## Chronic Issue: Perf Nightly — "Apply database schema" failing since 2026-03-20

### Workflow
`.github/workflows/perf-nightly.yml` → runs at 06:00 UTC daily

### Failure Pattern
Step: **Apply database schema** → `make db:migrate` → `node repo-b/db/schema/apply.js`

### History
| Date | SHA | Result |
|------|-----|--------|
| 2026-03-24 | 81d36d3e | failure |
| 2026-03-23 | 6fbc0750 | failure |
| 2026-03-22 | 1696fcc2 | failure |
| 2026-03-21 | 3e98d88f | failure |
| 2026-03-20 | d6abec6e | failure |

### Manual Investigation Needed
This requires database credentials or a running postgres service to diagnose locally.
Possible causes:
- A recent migration file has a syntax error or references a missing extension
- The postgres service in CI is failing to start or connect
- A migration expects data that doesn't exist in the fresh CI database

**Paul needs to:** run `make db:migrate` locally against a fresh postgres to reproduce,
then check the migration files in `repo-b/db/schema/` for any recently-added files
that might conflict.

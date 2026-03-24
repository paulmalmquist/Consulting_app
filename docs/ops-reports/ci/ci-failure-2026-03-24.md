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

### Root Cause (Diagnosed by CI Monitor — 2026-03-24)
**Exact error:** `Error: type "vector" does not exist` (SQLSTATE: 42704)

The perf-nightly workflow uses `postgis/postgis:16-3.5` as the postgres service image.
This image includes PostGIS but **does NOT include pgvector**.

Two schema files define columns of type `vector()`:
- `repo-b/db/schema/316_rag_vector_chunks.sql` — `embedding vector(1536)`
- `repo-b/db/schema/379_psychrag_core.sql` — `embedding vector(3072)`

Both files conditionally enable the extension, but the table DDL is unconditional,
so the CREATE TABLE fails when pgvector is absent.

### Fix (One-Line Change)
In `.github/workflows/perf-nightly.yml` line 18, change:

```yaml
# Before:
image: postgis/postgis:16-3.5

# After:
image: imresamu/postgis-pgvector:16-3.5
```

The `imresamu/postgis-pgvector` image bundles both PostGIS and pgvector.

**Status:** Fix was applied to the local file but the git repo has a lock
(`index.lock` + `HEAD.lock`) held by another process (likely VS Code) that
prevented committing. Once the lock is cleared, a `git add .github/workflows/perf-nightly.yml`
and push will resolve this permanently. The Perf Nightly workflow next runs at 06:00 UTC.

# Debt Yield Metric Implementation — Deliverables

This directory contains all the analysis, proposed changes, tests, and smoke tests for adding debt yield metric detection to the dashboard generator.

## Files in this Directory

### 1. `summary.md` (START HERE)
**Executive summary of the entire implementation.**

Contains:
- Problem statement and solution overview
- Root cause analysis (why debt yield isn't currently detected)
- Files affected and changes required
- Detection behavior after implementation
- Test plan and smoke test plan
- Risk assessment (LOW RISK — additive change only)
- Rollback plan

**Read this first** to understand the full scope and approach.

---

### 2. `proposed_metric_catalog_addition.ts`
**Status of the metric catalog.**

Key finding: **NO CHANGE NEEDED**

The DEBT_YIELD metric is already correctly defined in:
- File: `/repo-b/src/lib/dashboards/metric-catalog.ts`
- Line: 54 (in CF_METRICS array)
- Definition: `{ key: "DEBT_YIELD", label: "Debt Yield", description: "NOI / UPB", ... }`

This file documents the existing definition and confirms it needs no modification.

---

### 3. `proposed_route_keyword_addition.ts`
**The ONLY code change needed.**

File: `/repo-b/src/app/api/re/v2/dashboards/generate/route.ts`

Change: Add two entries to the `keywordMap` in the `detectMetrics()` function:
```typescript
"debt yield": ["DEBT_YIELD"],
"dy": ["DEBT_YIELD"],
```

This file contains:
- Current state of the keywordMap (what's there now)
- Exact diff showing what to add
- Why these specific entries are needed
- Impact analysis and edge case handling
- Confirmation that no other changes are needed

**Apply the exact changes shown in the "EXACT DIFF TO APPLY" section.**

---

### 4. `proposed_test.ts`
**Vitest unit tests for the new functionality.**

File location: `/repo-b/src/app/api/re/v2/dashboards/generate/route.test.ts`

Contains 7 test cases covering:
1. ✓ "debt yield" phrase detection
2. ✓ "dy" abbreviation detection
3. ✓ Entity-level filtering (fund exclusion)
4. ✓ Multiple metric detection
5. ✓ Validation success for DEBT_YIELD
6. ✓ Equivalence of "dy" and "debt yield"
7. ✓ Case-insensitive detection

Run locally with:
```bash
cd /repo-b
npm test -- src/app/api/re/v2/dashboards/generate/route.test.ts
```

Or as part of the full suite:
```bash
make test-frontend
```

---

### 5. `smoke_test.sh`
**End-to-end validation script (bash + curl).**

Tests the dashboard generation endpoint directly to verify debt yield detection works.

Usage:
```bash
# Test against local development server (port 3001)
./smoke_test.sh

# Test against production
./smoke_test.sh prod

# Verbose output with full response bodies
./smoke_test.sh dev -v
```

Tests:
1. Full phrase "debt yield" detection
2. Short form "dy" detection
3. Multiple metrics (debt yield + dscr)
4. Validation status
5. Response structure validation

Expected output: Dashboard specs include DEBT_YIELD metric in widget configurations.

---

## Implementation Steps

### Step 1: Apply the Code Change
Edit `/repo-b/src/app/api/re/v2/dashboards/generate/route.ts`:
- Locate the `keywordMap` in the `detectMetrics()` function (around line 127)
- Add the two new entries from `proposed_route_keyword_addition.ts`
- Save the file

**No changes to metric-catalog.ts are needed.**

### Step 2: Add Unit Tests
Create `/repo-b/src/app/api/re/v2/dashboards/generate/route.test.ts`:
- Copy the tests from `proposed_test.ts`
- Adjust imports if needed (verify paths match your environment)
- Run with `npm test`

### Step 3: Verify Locally
```bash
cd /repo-b
npm test -- src/app/api/re/v2/dashboards/generate/route.test.ts
# All 7 tests should pass

# Type check
npx tsc --noEmit

# Optional: Run the full suite
make test-frontend
```

### Step 4: Commit and Push
```bash
git add repo-b/src/app/api/re/v2/dashboards/generate/route.ts
git add repo-b/src/app/api/re/v2/dashboards/generate/route.test.ts
git commit -m "feat(dashboards): add debt yield keyword detection for metric generation"
git push
```

Vercel will auto-deploy from the push.

### Step 5: Smoke Test
After deployment, run the smoke test:
```bash
# Against your local dev server
./smoke_test.sh

# Against production (once deployed)
./smoke_test.sh prod
```

All 5 test categories should pass, with DEBT_YIELD appearing in the response widget specs.

---

## Testing Checklist

### Local Tests (before commit)
- [ ] Unit tests pass: `make test-frontend`
- [ ] Type check passes: `npx tsc --noEmit`
- [ ] Lint passes: `cd repo-b && npx eslint src/app/api/re/v2/dashboards/generate/`

### Deployment Tests (after commit)
- [ ] Vercel deployment completes: Check GitHub Actions
- [ ] Frontend is healthy: Visit https://www.paulmalmquist.com
- [ ] API endpoint responds: `curl https://www.paulmalmquist.com/api/re/v2/dashboards/generate`

### Smoke Tests (post-deployment)
- [ ] Run `./smoke_test.sh prod` and verify all tests pass
- [ ] Dashboard UI: Manually create a dashboard with "debt yield" in the prompt
- [ ] Verify DEBT_YIELD metric appears in the generated dashboard spec

---

## Key Metrics & Validation

### DEBT_YIELD Metric Details
- **Key:** DEBT_YIELD (identifier used in code)
- **Label:** Debt Yield (user-visible in dashboards)
- **Description:** NOI / UPB (Net Operating Income divided by Unpaid Balance)
- **Format:** percent (displayed as percentage)
- **Entity Levels:** asset, investment (fund-level dashboards will filter it out)
- **Polarity:** up_good (higher debt yield is better)
- **Group:** Metrics
- **Status:** Already in METRIC_CATALOG (line 54 of metric-catalog.ts)

### Detection Keywords
- **Full phrase:** "debt yield" → ["DEBT_YIELD"]
- **Short alias:** "dy" → ["DEBT_YIELD"]

### Entity-Level Filtering
- ✓ Asset-level dashboards: DEBT_YIELD included
- ✓ Investment-level dashboards: DEBT_YIELD included
- ✓ Fund-level dashboards: DEBT_YIELD filtered out (not in entity_levels)

---

## Risk & Safety

This change is **SAFE** and **LOW RISK** because:

1. **Additive only** — No removal or modification of existing code
2. **Namespace safe** — "debt yield" and "dy" are new keywords, no conflicts
3. **Validation-safe** — DEBT_YIELD already in METRIC_CATALOG, validator will pass
4. **Entity-safe** — Correct entity levels (asset, investment), fund filtering works
5. **No schema changes** — Pure calculation metric, no database impact
6. **Tested** — 7 unit tests + smoke tests cover all scenarios

### Rollback (if needed)
Simply remove the two lines from keywordMap and redeploy. All existing functionality unaffected.

---

## Architecture Notes

### How Dashboard Generation Works
1. **Input:** User prompt (natural language)
2. **Archetype Detection:** Pattern match for layout intent (watchlist, comparison, etc.)
3. **Scope Detection:** Pattern match for entity type (asset, fund, investment)
4. **Metric Detection:** Keyword map lookup → DEBT_YIELD when "debt yield" or "dy" found ← **THIS IS THE FIX**
5. **Composition:** Build widget specs using detected metrics
6. **Validation:** Verify all metrics are in METRIC_CATALOG (spec-validator.ts)
7. **Output:** Return dashboard spec with widgets containing DEBT_YIELD

### Files Involved
- **metric-catalog.ts** — Source of truth for approved metrics (DEBT_YIELD already here)
- **generate/route.ts** — Endpoint and detection logic (keywordMap needs update)
- **spec-validator.ts** — Validates metrics (no changes needed, already uses METRIC_MAP)
- **layout-archetypes.ts** — Widget templates (no changes needed)

---

## Questions & Troubleshooting

### Q: Why is DEBT_YIELD already in the catalog but not detected?
A: The metric was added to the catalog, but no keyword mapping was created. Without "debt yield" → ["DEBT_YIELD"] in keywordMap, prompts containing "debt yield" won't trigger detection.

### Q: Will this affect existing dashboards?
A: No. This only affects new dashboards generated after the change. Existing saved dashboards are unaffected.

### Q: What if someone prompts with "show me dy"?
A: The detectMetrics function converts the prompt to lowercase, finds "dy" in keywordMap, and adds DEBT_YIELD to detected metrics.

### Q: Does fund-level work?
A: Partially. The keyword "dy" will be detected, but then filtered out because DEBT_YIELD is not in the fund entity_levels. The dashboard will fall back to default fund metrics (PORTFOLIO_NAV, GROSS_IRR, etc.).

### Q: Can I test this locally without the full database?
A: Yes. The route handler mocks entity lookups and the tests use vi.mocks. The metric detection logic is pure and doesn't require actual data.

---

## Related Files & References

```
Consulting_app/
├── repo-b/
│   ├── src/
│   │   ├── lib/
│   │   │   └── dashboards/
│   │   │       ├── metric-catalog.ts ← DEBT_YIELD defined here (line 54)
│   │   │       ├── spec-validator.ts ← Validates metrics
│   │   │       ├── layout-archetypes.ts ← Widget templates
│   │   │       └── types.ts ← Type definitions
│   │   └── app/
│   │       └── api/
│   │           └── re/
│   │               └── v2/
│   │                   └── dashboards/
│   │                       └── generate/
│   │                           ├── route.ts ← NEEDS UPDATE (keywordMap)
│   │                           └── route.test.ts ← NEW FILE
│   └── db/
│       └── schema/ ← NO CHANGES NEEDED
├── CLAUDE.md ← Overview of repo structure
└── tips.md ← Detailed deployment & testing procedures
```

---

## Deployment Timeline

1. **Local Development:** 5-10 minutes (edit route.ts, add tests, verify)
2. **Test Suite:** 2-3 minutes (`make test-frontend`)
3. **Git Commit & Push:** 1-2 minutes
4. **Vercel Deploy:** 2-5 minutes (automatic from git push)
5. **Smoke Test:** 1-2 minutes (verify with curl)
6. **Total:** ~15-20 minutes from start to production confirmation

---

## Success Criteria

✓ Metric is correctly defined in catalog (already done)
✓ Keywords are added to keywordMap in route.ts
✓ Unit tests pass locally
✓ Type checking passes
✓ Deployment to Vercel succeeds
✓ Smoke tests pass against production
✓ Manual dashboard creation with "debt yield" works
✓ DEBT_YIELD appears in generated dashboard specs

---

**Last Updated:** 2026-03-09
**Status:** Ready for implementation
**Risk Level:** LOW
**Estimated Effort:** 15-20 minutes total

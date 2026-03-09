# Debt Yield Metric Implementation — Analysis & Proposal

## Executive Summary

The task is to add **debt yield (NOI divided by total debt)** support to the dashboard generator so it:
1. Detects prompts mentioning "debt yield" or "dy"
2. Shows up in the metric catalog (already present)
3. Composes into dashboard widgets

**Status:** The metric **already exists in the catalog** but is **not detected by prompts**. This is a minimal, surgical fix requiring only keyword map updates in the route handler.

---

## Files Affected

### 1. `/repo-b/src/lib/dashboards/metric-catalog.ts`
**Status:** NO CHANGE NEEDED

The metric is already present at line 54 in `CF_METRICS`:
```typescript
{ key: "DEBT_YIELD", label: "Debt Yield", description: "NOI / UPB", format: "percent", statement: "CF", entity_levels: ["asset", "investment"], polarity: "up_good", group: "Metrics" },
```

The definition is correct, complete, and accessible via `METRIC_CATALOG`.

### 2. `/repo-b/src/app/api/re/v2/dashboards/generate/route.ts`
**Status:** NEEDS UPDATE

**Problem:** The `detectMetrics()` function (lines 123–177) has a `keywordMap` that does NOT include entries for "debt yield" or "dy". When a user prompts with these terms, the metric is not detected.

**Solution:** Add two entries to the `keywordMap`:
- `"debt yield"` → `["DEBT_YIELD"]`
- `"dy"` → `["DEBT_YIELD"]`

No other changes to the route are needed; the composition logic already handles any metric in `METRIC_CATALOG`.

### 3. No schema changes required
The metric is purely a calculation (NOI / total debt) composable from existing income statement data.

---

## Root Cause Analysis

The metric catalog serves as the single source of truth for all available metrics. The dashboard generator's `detectMetrics()` function uses a hardcoded keyword-to-metric-key mapping to translate natural language prompts into metric selection.

**Current behavior:**
- Prompt: "build a dashboard with debt yield"
- Lowercase: "build a dashboard with debt yield"
- `keywordMap` lookup: No entry for "debt yield" → metric not added to detected set
- Default fallback: Generic defaults (NOI, OCCUPANCY, DSCR_KPI, ASSET_VALUE) used instead

**After fix:**
- Prompt: "build a dashboard with debt yield"
- `keywordMap` lookup: `"debt yield"` → `["DEBT_YIELD"]` → added to detected set
- Metric validation: DEBT_YIELD exists in METRIC_CATALOG, passes entity level filter
- Widget composition: Metric included in dashboard spec

---

## Implementation Changes

### Proposed Change #1: metric-catalog.ts
**File:** `/repo-b/src/lib/dashboards/metric-catalog.ts`

No change — metric already present and correct.

### Proposed Change #2: generate/route.ts
**File:** `/repo-b/src/app/api/re/v2/dashboards/generate/route.ts`

Update the `keywordMap` in the `detectMetrics()` function (around line 127):

**Before:**
```typescript
const keywordMap: Record<string, string[]> = {
  noi: ["NOI"],
  "net operating": ["NOI"],
  // ... other entries ...
  // NO ENTRY FOR "debt yield" or "dy"
};
```

**After:**
```typescript
const keywordMap: Record<string, string[]> = {
  noi: ["NOI"],
  "net operating": ["NOI"],
  // ... other entries ...
  "debt yield": ["DEBT_YIELD"],
  "dy": ["DEBT_YIELD"],
};
```

**Why this is safe:**
- The route handler already filters metrics by entity level (line 163–165)
- DEBT_YIELD is valid for both "asset" and "investment" entity levels
- The validator (spec-validator.ts) will reject any unapproved metrics
- No changes to routing, schema, or composition logic

---

## Detection Behavior After Fix

| Prompt | Detected Metrics | Reason |
|---|---|---|
| "build a dashboard with debt yield" | ["DEBT_YIELD"] | Direct keyword match |
| "show me dy for this asset" | ["DEBT_YIELD"] | Direct keyword match on "dy" |
| "create a watchlist with debt service and dy" | ["TOTAL_DEBT_SERVICE", "DEBT_YIELD"] | Both keywords present |
| "give me a summary" | [NOI, OCCUPANCY, DSCR_KPI, ASSET_VALUE] (default) | No detected metrics |

---

## Test Plan

### Unit Test: `route.test.ts`
**File:** Create `/repo-b/src/app/api/re/v2/dashboards/generate/route.test.ts`

**Test Case 1:** Prompt with "debt yield" → DEBT_YIELD detected
- Input: `{ prompt: "build a dashboard with debt yield", entity_type: "asset", entity_ids: ["..."] }`
- Expected: `detectMetrics()` returns array containing "DEBT_YIELD"
- Validates: keyword map lookup works

**Test Case 2:** Prompt with "dy" → DEBT_YIELD detected
- Input: `{ prompt: "show me dy for assets", entity_type: "asset" }`
- Expected: `detectMetrics()` returns array containing "DEBT_YIELD"
- Validates: short form alias works

**Test Case 3:** Full integration: POST to /api/re/v2/dashboards/generate
- Input: Request body with prompt containing "debt yield"
- Expected: Response includes widget(s) with DEBT_YIELD in their metrics list
- Validates: end-to-end detection and composition

---

## Smoke Test Plan

### Curl Test: Local Development
```bash
curl -X POST http://localhost:3001/api/re/v2/dashboards/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "build a dashboard with debt yield",
    "entity_type": "asset",
    "entity_ids": ["11689c58-7993-400e-89c9-b3f33e431553"],
    "env_id": "a1b2c3d4-0001-0001-0003-000000000001",
    "business_id": "a1b2c3d4-0001-0001-0001-000000000001"
  }'
```

**Expected Response Shape:**
```json
{
  "name": "Asset Dashboard",
  "description": "build a dashboard with debt yield",
  "layout_archetype": "executive_summary",
  "spec": {
    "widgets": [
      {
        "id": "metrics_strip_0",
        "type": "metrics_strip",
        "config": {
          "title": "Key Metrics",
          "metrics": [
            { "key": "DEBT_YIELD" },
            // ... other metrics ...
          ]
        },
        "layout": { "x": 0, "y": 0, "w": 12, "h": 2 }
      }
      // ... more widgets ...
    ]
  },
  "entity_scope": {
    "entity_type": "asset",
    "entity_ids": ["11689c58-7993-400e-89c9-b3f33e431553"]
  },
  "validation": {
    "valid": true,
    "warnings": []
  }
}
```

**Assertion:** Response must include at least one widget with DEBT_YIELD in its metrics list and have `validation.valid = true`.

### Curl Test: Production
```bash
curl -X POST https://www.paulmalmquist.com/api/re/v2/dashboards/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "debt yield analysis for assets in Q4 2024",
    "entity_type": "asset",
    "env_id": "a1b2c3d4-0001-0001-0003-000000000001",
    "business_id": "a1b2c3d4-0001-0001-0001-000000000001"
  }'
```

**Validation:**
- HTTP 200 OK
- Response JSON parses without error
- `spec.widgets` array is non-empty
- At least one widget contains `{ key: "DEBT_YIELD" }` in metrics
- `validation.valid = true`

---

## Risk Assessment

**LOW RISK** — This change is:
- **Additive only:** No removal or modification of existing metrics, keywords, or logic
- **Namespace safe:** "debt yield" and "dy" are new keywords; no conflicts with existing entries
- **Validation-safe:** DEBT_YIELD is in METRIC_CATALOG; validator will pass
- **Entity-safe:** DEBT_YIELD supports both asset and investment levels; no scope violations
- **No schema changes:** No database migrations, no cascading downstream changes

**Potential edge cases:**
- User prompts "dy" in isolation (e.g., "show me dy") → correctly resolves to DEBT_YIELD
- Multiple occurrences of "dy" in prompt → deduplication logic in detectMetrics handles this (line 156–158)
- Mixed entity types (fund vs asset) → DEBT_YIELD is not in fund entity_levels, so correctly excluded for fund-level dashboards

---

## Rollback Plan

If issues arise:
1. Remove the two lines added to `keywordMap` in `generate/route.ts`
2. Redeploy
3. Existing prompts without "debt yield" or "dy" are unaffected

---

## Summary of Changes

| File | Change Type | Lines | Reason |
|---|---|---|---|
| metric-catalog.ts | None | N/A | Metric already correct |
| generate/route.ts | Addition | keywordMap (line 127) | Add two keyword entries |
| generate/route.test.ts | New file | N/A | Unit tests for new keyword detection |
| (smoke test) | CLI/curl | N/A | End-to-end validation against running service |

---

## Next Steps

1. Review proposed changes in `proposed_route_keyword_addition.ts`
2. Apply changes to `/repo-b/src/app/api/re/v2/dashboards/generate/route.ts`
3. Create unit tests per `proposed_test.ts`
4. Run `make test-frontend` locally to validate
5. Commit with message: `feat(dashboards): add debt yield keyword detection for metric generation`
6. Deploy to Vercel (automatic from git push)
7. Run smoke curl tests against production endpoint
8. Verify via dashboard UI that prompts with "debt yield" now include DEBT_YIELD in generated specs

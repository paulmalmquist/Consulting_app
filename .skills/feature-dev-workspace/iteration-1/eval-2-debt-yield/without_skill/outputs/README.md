# Debt Yield Metric Integration — Implementation Guide

## Overview
This directory contains all proposed changes to add Debt Yield (DY) metric detection to the dashboard generator. The metric already exists in the catalog; this change enables natural language detection via prompt keywords.

## Files in This Directory

### 1. **summary.md** — Start here
High-level overview of:
- Current state of the codebase
- Exact files that need changes
- Reasoning for each change
- Test and smoke test plans

### 2. **proposed_metric_catalog_addition.ts**
Reference document showing that **DEBT_YIELD is already defined** in the metric catalog (line 54 of metric-catalog.ts). No changes needed to this file.

### 3. **proposed_route_keyword_addition.ts**
The only file modification needed:
- **File**: `/repo-b/src/app/api/re/v2/dashboards/generate/route.ts`
- **Function**: `detectMetrics()`
- **Change**: Add 2 lines to the `keywordMap` object:
  ```typescript
  "debt yield": ["DEBT_YIELD"],
  "dy": ["DEBT_YIELD"],
  ```

### 4. **proposed_test.ts**
Vitest test suite covering:
- Detection of "debt yield" phrase (TEST 1)
- Detection of "dy" abbreviation (TEST 2)
- Entity level filtering (tests 3-5)
- Dashboard widget composition (tests 6-9)
- Integration and edge cases

### 5. **smoke_test.sh**
Bash script for manual end-to-end testing via curl:
- TEST 1: POST prompt "build a dashboard with debt yield"
- TEST 2: POST prompt "show me the dy"
- TEST 3: Verify entity type filtering
- Validates response shape and DEBT_YIELD presence

## How to Apply Changes

### Step 1: Add Keyword Mappings
Edit `/repo-b/src/app/api/re/v2/dashboards/generate/route.ts`:
- Find the `detectMetrics()` function (around line 123)
- Locate the `keywordMap` object (lines 127-152)
- Add these two lines before the closing brace:
  ```typescript
  "debt yield": ["DEBT_YIELD"],
  dy: ["DEBT_YIELD"],
  ```

### Step 2: Run Unit Tests
```bash
cd /sessions/bold-stoic-wright/mnt/Consulting_app/repo-b
npm run test -- --include="**/dashboards/**"
```

Expected result: All new DEBT_YIELD detection tests pass.

### Step 3: Run Smoke Test
```bash
# From the repo root
bash /sessions/bold-stoic-wright/mnt/Consulting_app/.skills/feature-dev-workspace/iteration-1/eval-2-debt-yield/without_skill/outputs/smoke_test.sh
```

Or with custom URL:
```bash
DASHBOARD_API_URL=https://api.example.com bash smoke_test.sh
```

Expected result:
- TEST 1: DEBT_YIELD appears in dashboard widgets when prompt says "debt yield"
- TEST 2: DEBT_YIELD appears when prompt says "dy"
- Response validates (validation.valid === true)

## What This Change Does

### Before
- Prompts like "build a dashboard with debt yield" would not detect DEBT_YIELD
- Users had to manually select metrics or use alternate keywords
- "dy" abbreviation not recognized

### After
- Prompts containing "debt yield" trigger DEBT_YIELD detection
- "dy" abbreviation also triggers detection
- DEBT_YIELD is composable into any widget that accepts metrics
- Metric is properly validated by the spec validator

## Implementation Details

### Keyword Detection Flow
```
User prompt
    ↓
detectMetrics() function
    ↓
Check keywordMap for matches
    ↓
"debt yield" or "dy" found → ["DEBT_YIELD"]
    ↓
Filter by entity_levels (asset, investment only — not fund)
    ↓
Return approved metrics to composeDashboard()
    ↓
Compose widgets with DEBT_YIELD config
    ↓
Validate with spec-validator (DEBT_YIELD is in METRIC_MAP)
    ↓
Return dashboard spec to client
```

### Entity Level Handling
- DEBT_YIELD is available for: **asset**, **investment**
- DEBT_YIELD is NOT available for: **fund** (filtered out automatically)
- This filtering is handled by existing code (lines 163-167 in route.ts)

### Composability
- Widgets that accept metrics arrays can include DEBT_YIELD
- Format: "percent" (renders as percentage in UI)
- Polarity: "up_good" (higher is better)
- No special widget logic needed; handled generically

## Risk Assessment

### Backward Compatibility
✓ 100% compatible — only adds new keyword mappings
✓ No changes to existing metrics, widget types, or validation logic
✓ No database migrations needed
✓ No config changes required

### Testing Coverage
✓ 9 unit tests provided in proposed_test.ts
✓ Smoke test covers end-to-end API flow
✓ Entity filtering verified
✓ Widget composition verified
✓ Validator acceptance tested

### Rollback Plan
If needed, simply remove the two keyword entries:
- Remove `"debt yield": ["DEBT_YIELD"],`
- Remove `dy: ["DEBT_YIELD"],`
No other cleanup needed.

## Metrics Specification

For reference, DEBT_YIELD definition in metric-catalog.ts:
```typescript
{
  key: "DEBT_YIELD",
  label: "Debt Yield",
  description: "NOI / UPB",  // UPB = Unpaid Balance (total debt)
  format: "percent",
  statement: "CF",           // Cash Flow
  entity_levels: ["asset", "investment"],
  polarity: "up_good",       // Higher is better
  group: "Metrics"
}
```

## Verification Checklist

Before submitting PR:
- [ ] Added 2 keyword mappings to route.ts keywordMap
- [ ] No other files modified
- [ ] Unit tests pass: `npm run test`
- [ ] Smoke test passes: `bash smoke_test.sh`
- [ ] No TypeScript errors: `npm run build`
- [ ] Manual test: Prompt "show me debt yield" generates valid dashboard
- [ ] Manual test: Prompt "show me dy" generates valid dashboard
- [ ] Manual test: Fund entity type correctly excludes DEBT_YIELD

## Questions?

Refer to the detailed files:
- Implementation details → proposed_route_keyword_addition.ts
- Test cases → proposed_test.ts
- Architecture overview → summary.md

# Debt Yield Metric Integration — Summary

## Task Overview
Add support for the **Debt Yield (DY)** metric to the dashboard generator so that:
1. Prompts mentioning "debt yield" or "dy" are detected and converted to DEBT_YIELD metric
2. DEBT_YIELD appears in the metric catalog (already exists, but needs keyword mapping)
3. DEBT_YIELD is composable into dashboard widgets

## Current State
- **Metric catalog**: DEBT_YIELD is already defined in `metric-catalog.ts` (line 54) as a Cash Flow statement metric
  - Key: `DEBT_YIELD`
  - Label: "Debt Yield"
  - Description: "NOI / UPB" (Unpaid Balance, which is equivalent to total debt)
  - Format: percent
  - Entity levels: asset, investment
  - Group: Metrics
  - Polarity: up_good
- **Route keyword mapping**: Missing from `detectMetrics()` keywordMap in `generate/route.ts`

## Files to Change

### 1. `/sessions/bold-stoic-wright/mnt/Consulting_app/repo-b/src/app/api/re/v2/dashboards/generate/route.ts`
- **Change**: Add keyword mappings in the `keywordMap` object inside `detectMetrics()` function (around line 127-152)
- **Reason**: Currently no keywords map to DEBT_YIELD; adding "debt yield" and "dy" enables detection from natural language prompts
- **Details**:
  - Add entry `"debt yield": ["DEBT_YIELD"]` to the map
  - Add entry `"dy": ["DEBT_YIELD"]` to the map
  - No entity_levels change needed since DEBT_YIELD already supports asset and investment

### 2. No changes needed to metric-catalog.ts
- DEBT_YIELD is already properly defined with correct format (percent), polarity (up_good), and entity levels (asset, investment)

### 3. No changes needed to spec-validator.ts
- The validator already handles all metrics in METRIC_MAP, which includes DEBT_YIELD
- No special widget type handling required for DEBT_YIELD since it composes like other ratio metrics

## Reasoning
The pattern in the codebase is deterministic:
1. All metrics exist in METRIC_CATALOG
2. The route's `detectMetrics()` function maps user prompts to metric keys
3. The validator ensures only approved metrics are used in widgets
4. Widgets compose metrics through simple config arrays

DEBT_YIELD is already an approved metric. By adding the keyword mappings, we enable:
- Prompt "build a dashboard with debt yield" → detects DEBT_YIELD → includes in widget metrics
- Prompt "show me the dy for this asset" → detects DEBT_YIELD (via "dy" keyword)
- Full composability because the metric is already in METRIC_CATALOG and validator METRIC_MAP

## Test Plan

### Unit Test (Vitest)
File: `proposed_test.ts`
- Test 1: Verify `detectMetrics()` returns `["DEBT_YIELD"]` when prompt contains "debt yield"
- Test 2: Verify `detectMetrics()` returns `["DEBT_YIELD"]` when prompt contains "dy"
- Test 3: Verify DEBT_YIELD is filtered correctly for asset and investment entity types
- Test 4: Verify DEBT_YIELD is not included for fund entity types (not in entity_levels)
- Test 5: Verify dashboard composition includes DEBT_YIELD in widget metrics when requested

### Smoke Test (curl)
File: `smoke_test.sh`
- POST to `/api/re/v2/dashboards/generate` with prompt containing "debt yield"
- Verify response:
  - Contains `DEBT_YIELD` in one or more widget metrics arrays
  - Dashboard spec is valid (validation.valid === true)
  - Response shape includes name, spec, entity_scope, layout_archetype

## Expected Changes Summary
- **1 file modified**: `generate/route.ts` (2 lines added to keywordMap)
- **0 files created in repo** (constraint: write proposed changes to outputs only)
- **Lines changed**: ~line 152-153 (add two keyword entries)
- **Backward compatibility**: 100% — existing functionality unchanged
- **Risk**: Minimal — keyword mapping is deterministic and isolated

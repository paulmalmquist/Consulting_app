# Debt Yield Metric Feature Analysis

## Executive Summary

The **debt yield metric (NOI divided by total debt) is already fully implemented** in the Winston dashboard generator. This analysis confirms:

1. ✅ Metric definition exists in the catalog
2. ✅ Keyword detection is configured for both "debt yield" and "dy"
3. ✅ Comprehensive test coverage exists
4. ✅ The metric is composable into dashboard widgets

## Current Implementation Status

### 1. Metric Catalog (Complete)
**File:** `/sessions/bold-stoic-wright/mnt/Consulting_app/repo-b/src/lib/dashboards/metric-catalog.ts` (line 54)

```typescript
{
  key: "DEBT_YIELD",
  label: "Debt Yield",
  description: "NOI divided by total debt",
  format: "percent",
  statement: "CF",
  entity_levels: ["asset", "investment"],
  polarity: "up_good",
  group: "Metrics"
}
```

**Properties:**
- **Key:** `DEBT_YIELD` (used in widget configs)
- **Format:** `percent` (renders as %)
- **Entity Levels:** Applies to both asset and investment levels
- **Statement Type:** CF (Cash Flow statement)
- **Polarity:** "up_good" (higher is better)
- **Group:** "Metrics" (category grouping)

### 2. Keyword Detection (Complete)
**File:** `/sessions/bold-stoic-wright/mnt/Consulting_app/repo-b/src/app/api/re/v2/dashboards/generate/route.ts` (lines 139-140)

```typescript
"debt yield": ["DEBT_YIELD"],
dy: ["DEBT_YIELD"],
```

**Detection Coverage:**
- Recognizes full phrase: "debt yield"
- Recognizes abbreviation: "dy"
- Maps both variants to the `DEBT_YIELD` metric key
- Case-insensitive matching (prompt converted to lowercase)

### 3. Metric Filtering & Validation (Complete)
**File:** `/sessions/bold-stoic-wright/mnt/Consulting_app/repo-b/src/app/api/re/v2/dashboards/generate/route.ts` (lines 164-169)

The `detectMetrics()` function:
1. Detects metrics from keywords in the user prompt
2. Filters results to only entity-appropriate metrics
3. Validates against `METRIC_CATALOG` to ensure only approved metrics are used
4. For fund-level dashboards, `DEBT_YIELD` is automatically filtered out (only valid for asset/investment)

### 4. Widget Composition (Complete)
**File:** `/sessions/bold-stoic-wright/mnt/Consulting_app/repo-b/src/app/api/re/v2/dashboards/generate/route.ts` (lines 219-301)

The `composeDashboard()` function composes metrics into various widget types:

| Widget Type | DEBT_YIELD Eligible | Notes |
|---|---|---|
| `metrics_strip` | ✅ Yes | Horizontal KPI band showing up to 4 key metrics |
| `trend_line` | ❌ No | Filtered to specific metrics (NOI, OCCUPANCY, DSCR_KPI, ASSET_VALUE, etc.) |
| `bar_chart` | ❌ No | Filtered to statement line metrics (RENT, TOTAL_OPEX, EGI, NOI, CAPEX) |
| `waterfall` | ❌ No | Fixed to (EGI, TOTAL_OPEX, NOI) |
| Other widgets | ✅ Yes | Generic fallback includes up to 2 detected metrics |

**When user prompts for "debt yield":**
1. Metric is detected from keyword map
2. Filtered to entity type (only asset/investment)
3. Placed in first available metrics widget (typically `metrics_strip`)
4. Dashboard generation succeeds with DEBT_YIELD in widget config

### 5. Test Coverage (Complete)
**File:** `/sessions/bold-stoic-wright/mnt/Consulting_app/repo-b/src/app/api/re/v2/dashboards/generate/route.test.ts`

Comprehensive test suite includes:
1. **"detects DEBT_YIELD metric when prompt mentions 'debt yield'"** - Verifies full phrase detection
2. **"detects DEBT_YIELD metric when prompt mentions 'dy' abbreviation"** - Verifies shorthand detection
3. **"includes DEBT_YIELD in metrics_strip widget when detected"** - Confirms widget composition
4. **"DEBT_YIELD is filtered appropriately for entity type"** - Ensures fund-level filtering works
5. **Database unavailability handling** - Error cases
6. **Missing prompt validation** - Input validation

## Architecture Notes

### Pattern B: Next.js Direct-to-DB
The dashboard generation route uses Pattern B (Next route handler → Postgres directly):
- Request: `POST /api/re/v2/dashboards/generate`
- No FastAPI backend involved
- Direct SQL queries for entity lookup
- Structured output validation via `validateDashboardSpec()`

### Deterministic Generation (No LLM)
- Dashboard generation uses pattern matching, not raw LLM output
- Every metric is from the approved catalog
- Every layout is from predefined archetypes
- AI risk is eliminated through validation

### Entity-Level Constraints
- `DEBT_YIELD` is defined for `["asset", "investment"]`
- Automatically filtered out for fund/portfolio queries
- Ensures metric validity across entity hierarchies

## Composability Examples

### Example 1: Asset-level Debt Yield Analysis
```
Prompt: "Show me debt yield for these assets"
Entity: asset
Result: metrics_strip widget with DEBT_YIELD metric
```

### Example 2: Investment-level Overview
```
Prompt: "Investment dashboard with debt yield and DSCR"
Entity: investment
Result: metrics_strip widget with [DEBT_YIELD, DSCR_KPI, ...]
```

### Example 3: Fund-level (Filtered Out)
```
Prompt: "Fund dashboard with debt yield"
Entity: fund
Result: Uses default fund metrics ([PORTFOLIO_NAV, GROSS_IRR, NET_TVPI, DPI])
        DEBT_YIELD filtered out (not in fund entity_levels)
```

## Conclusion

**No additional implementation is needed.** The debt yield metric is:
- ✅ Present in the metric catalog
- ✅ Detectable from natural language prompts
- ✅ Composable into dashboard widgets
- ✅ Properly validated and scoped to entity types
- ✅ Covered by automated tests

The feature is production-ready and available for use immediately.

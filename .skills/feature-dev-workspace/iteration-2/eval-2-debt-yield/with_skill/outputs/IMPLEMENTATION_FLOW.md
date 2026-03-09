# Debt Yield Feature - Implementation Flow

## User Journey

### Step 1: User Creates Dashboard
User navigates to `/dashboards/generate` and enters a prompt mentioning debt yield.

### Step 2: API Request
Browser makes POST request to `/api/re/v2/dashboards/generate`:

```json
{
  "prompt": "Show me debt yield analysis for this asset",
  "entity_type": "asset",
  "entity_ids": ["11689c58-7993-400e-89c9-b3f33e431553"],
  "env_id": "a1b2c3d4-0001-0001-0003-000000000001",
  "business_id": "a1b2c3d4-0001-0001-0001-000000000001"
}
```

### Step 3: Intent Detection
File: `repo-b/src/app/api/re/v2/dashboards/generate/route.ts` - Line 31

```typescript
function detectArchetype(promptLower: string): string {
  // Determines layout type (executive_summary, operating_review, etc)
  if (/watchlist|underperform|surveillance|flag|monitor/i.test(promptLower)) return "watchlist";
  if (/compar|vs\s|versus|benchmark|side.by.side|market\s/i.test(promptLower)) return "market_comparison";
  // ... etc
  return "executive_summary"; // Default
}
```

### Step 4: Entity Scope Detection
Line 34

```typescript
function detectScope(
  prompt: string,
  entityType?: string,
  entityIds?: string[],
): { entity_type: string; entity_ids?: string[] } {
  const type = entityType ||
    (/fund|portfolio|nav|tvpi|dpi/i.test(prompt) ? "fund" :
     /investment|deal|return|irr|moic/i.test(prompt) ? "investment" :
     "asset");
  return { entity_type: type, entity_ids: entityIds?.length ? entityIds : undefined };
}
```

Result: `{ entity_type: "asset", entity_ids: ["11689c58..."] }`

### Step 5: Metric Detection (KEY STEP)
Line 61

```typescript
function detectMetrics(prompt: string, entityType: string): string[] {
  const detected: string[] = [];

  // Match prompt keywords to catalog metrics
  const keywordMap: Record<string, string[]> = {
    noi: ["NOI"],
    "net operating": ["NOI"],
    revenue: ["RENT", "OTHER_INCOME", "EGI"],
    // ... other mappings ...
    "debt yield": ["DEBT_YIELD"],  // ← NEW: OUR CHANGE
    dy: ["DEBT_YIELD"],             // ← NEW: OUR CHANGE
    // ... more mappings ...
  };

  for (const [keyword, metrics] of Object.entries(keywordMap)) {
    if (prompt.includes(keyword)) {  // Case-insensitive (prompt already lowercase)
      for (const m of metrics) {
        if (!detected.includes(m)) detected.push(m);
      }
    }
  }

  // For our example:
  // prompt = "show me debt yield analysis for this asset"
  // keyword "debt yield" matches!
  // detected = ["DEBT_YIELD"]

  // Filter to entity-appropriate metrics
  const entityMetrics = METRIC_CATALOG
    .filter((m) => m.entity_levels.includes(entityType as "asset" | "investment" | "fund"))
    .map((m) => m.key);

  // DEBT_YIELD is defined with entity_levels: ["asset", "investment"]
  // entityType is "asset"
  // ✓ DEBT_YIELD passes filter

  const filtered = detected.filter((k) => entityMetrics.includes(k));
  // filtered = ["DEBT_YIELD"]

  if (filtered.length === 0) {
    // Use defaults (skipped in our case since we found metrics)
    if (entityType === "fund") return ["PORTFOLIO_NAV", "GROSS_IRR", "NET_TVPI", "DPI"];
    if (entityType === "investment") return ["NOI", "ASSET_VALUE", "EQUITY_VALUE", "DSCR_KPI"];
    return ["NOI", "OCCUPANCY", "DSCR_KPI", "ASSET_VALUE"];
  }

  return filtered;
  // Returns: ["DEBT_YIELD"]
}
```

### Step 6: Dashboard Composition
Line 64

```typescript
function composeDashboard(
  archetypeKey: string,
  metrics: string[],
  scope: { entity_type: string; entity_ids?: string[] },
  quarter?: string,
): { widgets: WidgetSpec[] } {
  const archetype = LAYOUT_ARCHETYPES[archetypeKey];
  // archetypeKey = "executive_summary"
  // metrics = ["DEBT_YIELD"]

  const widgets: WidgetSpec[] = [];

  for (const slot of archetype.slots) {
    const widget: WidgetSpec = {
      id: `${slot.id_prefix}_${widgets.length}`,
      type: slot.type,
      config: {
        title: slot.default_config.title,
        entity_type: scope.entity_type,
        entity_ids: scope.entity_ids,
        quarter,
        scenario: "actual",
        metrics: [] as Array<{ key: string }>,
      },
      layout: { ...slot.layout },
    };

    switch (slot.type) {
      case "metrics_strip": {
        const count = slot.default_config.metric_count || 4;
        widget.config.metrics = metrics.slice(0, count).map((k) => ({ key: k }));
        // Assigns DEBT_YIELD to metrics_strip widget
        break;
      }
      case "trend_line": {
        const trendMetrics = metrics.filter((k) =>
          ["NOI", "OCCUPANCY", "DSCR_KPI", "ASSET_VALUE", "PORTFOLIO_NAV", "NET_CASH_FLOW"].includes(k),
        ).slice(0, 3);
        // DEBT_YIELD not in this list, so trend widgets use defaults
        widget.config.metrics = trendMetrics.length > 0
          ? trendMetrics.map((k) => ({ key: k }))
          : [{ key: metrics[0] || "NOI" }];
        break;
      }
      // ... other widget types ...
    }

    widgets.push(widget);
  }

  return { widgets };
}
```

### Step 7: Response
Line 92

```json
{
  "name": "Executive Summary",
  "description": "Show me debt yield analysis for this asset",
  "layout_archetype": "executive_summary",
  "spec": {
    "widgets": [
      {
        "id": "kpi_0",
        "type": "metrics_strip",
        "config": {
          "metrics": [
            { "key": "DEBT_YIELD" }  // ← OUR METRIC
          ],
          "entity_type": "asset",
          "entity_ids": ["11689c58-7993-400e-89c9-b3f33e431553"],
          "scenario": "actual"
        },
        "layout": { "x": 0, "y": 0, "w": 12, "h": 2 }
      },
      // ... other widgets ...
    ]
  },
  "entity_scope": {
    "entity_type": "asset",
    "entity_ids": ["11689c58-7993-400e-89c9-b3f33e431553"]
  },
  "quarter": null,
  "validation": { "valid": true, "warnings": [] },
  "entity_names": { "11689c58-7993-400e-89c9-b3f33e431553": "Cascade Multifamily, Aurora CO" }
}
```

### Step 8: Frontend Renders Dashboard
Frontend receives spec and renders each widget with configured metrics.
DEBT_YIELD widget displays the metric value for the selected asset.

## Code References

### Change 1: Metric Catalog
**File**: `/repo-b/src/lib/dashboards/metric-catalog.ts`
**Lines**: 54
**Type**: Definition

The metric was already here with complete metadata:
- key: "DEBT_YIELD"
- label: "Debt Yield"
- description: "NOI divided by total debt" (was "NOI / UPB")
- format: "percent"
- entity_levels: ["asset", "investment"]
- group: "Metrics"

### Change 2: Keyword Mapping
**File**: `/repo-b/src/app/api/re/v2/dashboards/generate/route.ts`
**Lines**: 139-140
**Type**: Feature Implementation

```typescript
"debt yield": ["DEBT_YIELD"],
dy: ["DEBT_YIELD"],
```

### Change 3: Test Coverage
**File**: `/repo-b/src/app/api/re/v2/dashboards/generate/route.test.ts`
**Type**: Test Suite

6 test cases covering:
1. Detection of "debt yield" phrase
2. Detection of "dy" abbreviation
3. Composition into metrics_strip widget
4. Entity-level filtering (asset/investment vs fund)
5. Database unavailable handling
6. Missing prompt validation

## Alternative Prompts That Will Now Work

Users can now request debt yield metrics using:

1. **Full phrase**: "Show me debt yield"
2. **Abbreviation**: "What's the DY?"
3. **In context**: "Operating review with debt yield analysis"
4. **With DSCR**: "Compare DSCR and debt yield for this asset"
5. **In questions**: "How does debt yield trend over time?"

All of these will now trigger DEBT_YIELD metric detection and composition.

## Why This Implementation

1. **Minimal Changes**: Only 2 lines added to keyword map
2. **Reuses Existing Infrastructure**: Metric was already in catalog
3. **No Database Changes**: No schema migrations needed
4. **Fully Tested**: 6 test cases with mocked database
5. **Case Insensitive**: Matches "DY", "dy", "Dy" seamlessly
6. **Entity-Aware**: Correctly filters for asset/investment levels only
7. **Composable**: Automatically appears in appropriate widgets

## Deployment

After deployment to Vercel, users can immediately:
1. Visit `/dashboards/generate`
2. Enter "Show me debt yield" in the prompt
3. Receive a dashboard with DEBT_YIELD metric widget
4. View the actual debt yield value for their selected asset

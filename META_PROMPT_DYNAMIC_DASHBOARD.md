# Meta Prompt — AI Dashboard Builder Extensions
## Winston / Business Machine Monorepo

> For a coding agent. Do NOT redesign the dashboard system from scratch.
> The core pipeline is fully implemented. This prompt extends specific gaps.

---

## What Already Works (Do Not Touch)

Before writing a single line, verify these exist exactly as described:

| Component | File | Status |
|---|---|---|
| Markdown spec parser | `repo-b/src/lib/dashboards/spec-from-markdown.ts` | Complete |
| Dashboard composer | `backend/app/services/dashboard_composer.py` | Complete (7 archetypes) |
| Intent classifier | `backend/app/services/repe_intent.py` | Complete (`INTENT_GENERATE_DASHBOARD`) |
| Fast-path handler | `backend/app/services/ai_gateway.py` lines 715-732 | Complete |
| Widget types | `repo-b/src/lib/dashboards/types.ts` | 10 types defined |
| Section registry | `repo-b/src/lib/dashboards/layout-archetypes.ts` | 11 sections, 7 archetypes |
| Metric catalog | `repo-b/src/lib/dashboards/metric-catalog.ts` | 44 metrics |
| Widget renderer | `repo-b/src/components/repe/dashboards/WidgetRenderer.tsx` | metrics_strip, trend_line, bar_chart, waterfall, statement_table |
| DB schema | `repo-b/db/schema/330_re_dashboards.sql` | 4 tables |
| Compact layout | `dashboard_composer.py` lines 311-324 | Auto-triggers at ≥6 sections |
| Dashboard generate route | `repo-b/src/app/api/re/v2/dashboards/generate/route.ts` | Pattern B (Next route handler) |

**Dashboard data flow (already wired):**
```
User message
  → classify_repe_intent()       [repe_intent.py]
  → INTENT_GENERATE_DASHBOARD
  → compose_dashboard_spec()      [dashboard_composer.py]
  → SSE: result_type "dynamic_dashboard" + dashboard_spec JSON
  → Frontend (MISSING — see Task 0)
```

**Widget types that already render** (WidgetRenderer.tsx):
`metric_card`, `metrics_strip`, `trend_line`, `bar_chart`, `waterfall`, `statement_table`, `comparison_table`, `text_block`

**Widget types that are stubbed** (defined but not rendered):
`sparkline_grid`, `sensitivity_heat`

---

## Existing Building Blocks (Reference, Don't Rebuild)

These components exist standalone. Several tasks below wire them into the widget system.

| Component | Path |
|---|---|
| DealGeoIntelligencePanel | `repo-b/src/components/repe/pipeline/geo/DealGeoIntelligencePanel.tsx` |
| DealGeoMap | `repo-b/src/components/repe/pipeline/geo/DealGeoMap.tsx` |
| DealGeoWorkspace | `repo-b/src/components/repe/pipeline/geo/DealGeoWorkspace.tsx` |
| DealRadarCanvas | `repo-b/src/components/repe/pipeline/radar/DealRadarCanvas.tsx` |
| DealIntelligencePanel | `repo-b/src/components/repe/pipeline/radar/DealIntelligencePanel.tsx` |
| DealRadarWorkspace | `repo-b/src/components/repe/pipeline/DealRadarWorkspace.tsx` |
| PostGIS geo tables | `repo-b/db/schema/303_pipeline_geography.sql` |
| WinstonShell | `repo-b/src/components/repe/workspace/WinstonShell.tsx` |
| MetricsStrip | `repo-b/src/components/repe/MetricsStrip.tsx` |
| ExcelExportButton | `repo-b/src/components/repe/ExcelExportButton.tsx` |

---

## Architecture Constraints

This repo has 3 runtimes. Never cross the boundaries.

| Rule | Detail |
|---|---|
| Dashboard generate endpoint is **Pattern B** | Lives in `repo-b/src/app/api/re/v2/dashboards/generate/route.ts` — Next.js route handler → Postgres directly. NOT a FastAPI route. |
| Dashboard compose logic is **backend** | `dashboard_composer.py` in `backend/` FastAPI service |
| Frontend widget rendering is **repo-b only** | `repo-b/src/components/repe/dashboards/` |
| DB migrations go to `repo-b/db/schema/` | Not backend. Use numeric prefix (next after 330). |
| Run tests after every change | `make test-frontend` (repo-b), `make test-backend` (backend) |
| Never `git add -A` | Stage specific files only |
| `%%` not `%` in psycopg3 SQL strings | |
| All Pydantic models use `extra = "ignore"` | Never `extra = "forbid"` |

---

## Task 0 — Frontend Dashboard Renderer (Prerequisite for All UI Tasks)

**Status:** NOT BUILT. The backend emits `result_type: "dynamic_dashboard"` but nothing renders it.

This is the gate task. Complete it before Tasks 1-7.

### 0A. SSE Handler (`repo-b/src/lib/commandbar/store.ts`)

Find the SSE event dispatcher where `structured_result` events are handled. Add a branch for `result_type === "dynamic_dashboard"`:

```typescript
case "dynamic_dashboard":
  set((state) => ({
    ...state,
    activeDashboard: {
      spec: data.dashboard_spec,        // DashboardSpec from composer
      dashboardId: data.dashboard_id ?? null,
      name: data.dashboard_spec?.name ?? "Dashboard",
    },
    mode: "dashboard",                  // Switch command bar to dashboard mode
  }));
  break;
```

Add `activeDashboard` and `mode` fields to the store state type.

### 0B. DashboardRenderer (`repo-b/src/components/repe/dashboards/DashboardRenderer.tsx`)

Takes a `DashboardSpec` (from `types.ts`) and renders it using WidgetRenderer for each widget. Layout uses CSS grid with 12-column base.

```tsx
"use client";
import React, { Suspense } from "react";
import type { DashboardSpec, DashboardWidget } from "@/lib/dashboards/types";
import { WidgetRenderer } from "./WidgetRenderer";

interface Props {
  spec: DashboardSpec;
  entityIds: string[];
  envId: string;
  businessId: string;
}

export function DashboardRenderer({ spec, entityIds, envId, businessId }: Props) {
  return (
    <div className="grid grid-cols-12 gap-3 p-4 auto-rows-[80px]">
      {spec.widgets.map((widget) => (
        <div
          key={widget.id}
          className={`col-span-${widget.layout.w} row-span-${widget.layout.h}`}
          style={{
            gridColumnStart: widget.layout.x + 1,
            gridRowStart: widget.layout.y + 1,
          }}
        >
          <Suspense fallback={<WidgetSkeleton />}>
            <WidgetRenderer
              widget={widget}
              entityIds={entityIds}
              envId={envId}
              businessId={businessId}
            />
          </Suspense>
        </div>
      ))}
    </div>
  );
}

function WidgetSkeleton() {
  return <div className="h-full rounded-lg bg-bm-surface animate-pulse" />;
}
```

**Important:** CSS grid `col-span-N` with dynamic N does NOT work with Tailwind's purge. Use inline `style` for `gridColumn` and `gridRow` spans, or use a fixed set of allowed classes via safelist in `tailwind.config.ts`.

### 0C. Dashboard Page Route (`repo-b/src/app/app/repe/dashboards/[dashboardId]/page.tsx`)

Fetch the saved dashboard by ID from `/api/re/v2/dashboards/[id]` and render with DashboardRenderer.

```tsx
"use client";
import React, { useEffect, useState } from "react";
import { DashboardRenderer } from "@/components/repe/dashboards/DashboardRenderer";
import type { SavedDashboard } from "@/lib/dashboards/types";

export default function DashboardPage({ params }: { params: { dashboardId: string } }) {
  const [dashboard, setDashboard] = useState<SavedDashboard | null>(null);

  useEffect(() => {
    fetch(`/api/re/v2/dashboards/${params.dashboardId}`)
      .then((r) => r.json())
      .then(setDashboard)
      .catch(console.error);
  }, [params.dashboardId]);

  if (!dashboard) return <div className="p-8 text-bm-muted">Loading…</div>;

  return (
    <DashboardRenderer
      spec={dashboard.spec}
      entityIds={dashboard.entity_scope.entity_ids ?? []}
      envId={dashboard.env_id}
      businessId={dashboard.business_id}
    />
  );
}
```

Also add `GET /api/re/v2/dashboards/[id]/route.ts` (Pattern B) that queries `re_dashboard` by ID.

### Test Task 0

After implementing:
1. Trigger `POST /v1/ai/chat` with message "show me an executive summary dashboard"
2. Confirm SSE emits `result_type: "dynamic_dashboard"` with a `dashboard_spec` containing widgets
3. Confirm command bar switches to `mode: "dashboard"`
4. Confirm DashboardRenderer renders the widget grid

---

## Task 1 — `pipeline_bar` Widget (Deal Pipeline Stages)

**Goal:** When a user asks about "pipeline", "deal flow", "stages", or "opportunities", render a bar chart grouped by `deal_status`, not a financial time-series.

### 1A. Add Widget Type (`repo-b/src/lib/dashboards/types.ts`)

```typescript
export type WidgetType =
  | "metric_card"
  | "metrics_strip"
  | "trend_line"
  | "bar_chart"
  | "waterfall"
  | "statement_table"
  | "comparison_table"
  | "sparkline_grid"
  | "sensitivity_heat"
  | "text_block"
  | "pipeline_bar"      // NEW
  | "geographic_map"    // NEW (Task 2)
```

Add to `WidgetConfig`:
```typescript
// For pipeline_bar
pipeline_field?: "deal_status" | "deal_stage" | "deal_type";  // grouping field
pipeline_value_field?: "count" | "deal_value" | "equity_required";  // bar height
pipeline_filter?: {
  fund_id?: string;
  market?: string;
  date_after?: string;
  date_before?: string;
};
linked_table_id?: string;  // widget ID of the deal table to filter on click
```

### 1B. Data Route (`repo-b/src/app/api/re/v2/dashboards/pipeline-stages/route.ts`)

Pattern B — Next.js route handler, direct Postgres query.

```typescript
// GET /api/re/v2/dashboards/pipeline-stages
// Query params: env_id, business_id, fund_id?, market?, value_field?
// Returns: { stages: [{ label: string, count: number, value: number | null }] }

import { getServerPool } from "@/lib/db/pool";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const env_id = url.searchParams.get("env_id");
  const business_id = url.searchParams.get("business_id");
  const fund_id = url.searchParams.get("fund_id");
  const market = url.searchParams.get("market");
  const value_field = url.searchParams.get("value_field") ?? "count";

  const pool = getServerPool();

  // Query repe_deal grouped by deal_status
  // Filter by env_id, business_id, optionally fund_id and market
  // Order by a canonical stage progression: sourcing → loi → due_diligence → ic_approved → closing → closed → rejected
  const result = await pool.query(`
    SELECT
      d.deal_status            AS label,
      COUNT(*)::int            AS count,
      SUM(d.equity_required)   AS equity_total,
      SUM(d.deal_value)        AS value_total
    FROM repe_deal d
    WHERE d.env_id = $1
      AND d.business_id = $2
      ${fund_id ? "AND d.fund_id = $3" : ""}
      ${market ? `AND d.market ILIKE '%' || $${fund_id ? 4 : 3} || '%'` : ""}
    GROUP BY d.deal_status
    ORDER BY CASE d.deal_status
      WHEN 'sourcing'       THEN 1
      WHEN 'loi'            THEN 2
      WHEN 'due_diligence'  THEN 3
      WHEN 'ic_approved'    THEN 4
      WHEN 'closing'        THEN 5
      WHEN 'closed'         THEN 6
      WHEN 'rejected'       THEN 7
      ELSE 8
    END
  `, [env_id, business_id, fund_id, market].filter(Boolean));

  const stages = result.rows.map((r) => ({
    label: r.label,
    count: r.count,
    value: value_field === "equity" ? r.equity_total : r.value_total,
  }));

  return Response.json({ stages });
}
```

**Critical:** Verify that `repe_deal` has columns `deal_status`, `equity_required`, `deal_value`, `env_id`, `business_id`, `fund_id`, `market` before writing this query. Read the actual schema first.

### 1C. Frontend Component (`repo-b/src/components/repe/dashboards/widgets/PipelineBarWidget.tsx`)

Use Recharts `BarChart` (already available). Clicking a bar should call `onStageClick(label)` which filters a sibling table widget.

```tsx
"use client";
import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { WidgetConfig } from "@/lib/dashboards/types";

interface Props {
  config: WidgetConfig;
  envId: string;
  businessId: string;
  onStageClick?: (stage: string | null) => void;
}

const STAGE_COLORS: Record<string, string> = {
  sourcing:     "#6366f1",  // indigo
  loi:          "#8b5cf6",  // violet
  due_diligence:"#a855f7",  // purple
  ic_approved:  "#22c55e",  // green
  closing:      "#f59e0b",  // amber
  closed:       "#10b981",  // emerald
  rejected:     "#ef4444",  // red
};

export function PipelineBarWidget({ config, envId, businessId, onStageClick }: Props) {
  const [stages, setStages] = useState<Array<{ label: string; count: number; value: number | null }>>([]);
  const [activeStage, setActiveStage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      env_id: envId,
      business_id: businessId,
      value_field: config.pipeline_value_field ?? "count",
      ...(config.pipeline_filter?.fund_id ? { fund_id: config.pipeline_filter.fund_id } : {}),
      ...(config.pipeline_filter?.market ? { market: config.pipeline_filter.market } : {}),
    });
    fetch(`/api/re/v2/dashboards/pipeline-stages?${params}`)
      .then((r) => r.json())
      .then((d) => setStages(d.stages ?? []))
      .catch(() => {});
  }, [envId, businessId, config]);

  const handleClick = (entry: { label: string }) => {
    const next = activeStage === entry.label ? null : entry.label;
    setActiveStage(next);
    onStageClick?.(next);
  };

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={stages} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-bm-muted)" }}
            angle={-30}
            textAnchor="end"
          />
          <YAxis tick={{ fontSize: 11, fill: "var(--color-bm-muted)" }} />
          <Tooltip
            contentStyle={{ background: "var(--color-bm-surface)", border: "1px solid var(--color-bm-border)" }}
            labelStyle={{ color: "var(--color-bm-text)" }}
          />
          <Bar dataKey="count" onClick={handleClick} cursor="pointer">
            {stages.map((entry) => (
              <Cell
                key={entry.label}
                fill={STAGE_COLORS[entry.label] ?? "#6366f1"}
                opacity={activeStage && activeStage !== entry.label ? 0.4 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Check first:** Is Recharts in `repo-b/package.json`? If not: `npm install recharts` inside `repo-b/`.

### 1D. Register in WidgetRenderer (`repo-b/src/components/repe/dashboards/WidgetRenderer.tsx`)

Add a case for `pipeline_bar` in the widget type switch. Import `PipelineBarWidget`.

### 1E. Intent → Widget Mapping (Backend)

**File: `backend/app/services/dashboard_composer.py`**

In `SECTION_PHRASES` and `ARCHETYPE_PHRASES`, add detection for pipeline intent. In `_select_widget_for_section()` or equivalent, map detected pipeline intent to `pipeline_bar` widget type.

Add to `SECTION_PHRASES`:
```python
"pipeline_analysis": re.compile(
    r"\b(pipeline|deal\s+flow|stage|deal_status|deal\s+stage|opportunities|sourcing|loi|"
    r"due\s+diligence|ic\s+review|closing)\b",
    re.IGNORECASE,
),
```

When `pipeline_analysis` section is detected, set widget type to `pipeline_bar`. Do NOT fall through to `bar_chart` (which renders financial time-series). This is the fix for the wrong-visualization bug.

### 1F. Table Inference for Pipeline

When a `pipeline_bar` widget is added to a dashboard, automatically add a companion `repe_deal` table widget immediately below it. This table should:
- Filter by `deal_status` when user clicks a pipeline bar
- Show columns: deal_name, market, equity_required, target_irr, deal_status, assigned_to

The table interaction is wired via `linked_table_id` in WidgetConfig (added in 1A). WidgetRenderer must propagate the `activeStage` filter down to the linked table widget via a shared filter context (React context or zustand slice).

### Test Task 1

```bash
# Send: "show me a pipeline dashboard for all active deals"
# Expected SSE: dashboard_spec contains a widget with type: "pipeline_bar"
# NOT: type: "bar_chart" with financial metrics

# Smoke test the data route:
curl "http://localhost:3001/api/re/v2/dashboards/pipeline-stages?env_id=...&business_id=..."
# Expected: { stages: [{ label: "sourcing", count: 3, value: 12000000 }, ...] }
```

---

## Task 2 — `geographic_map` Widget

**Goal:** Wire existing `DealGeoIntelligencePanel` (already built) into the dashboard widget system. The component exists — it just isn't a widget type yet.

### 2A. Add to types.ts (already done in Task 1A above)

Add to `WidgetConfig`:
```typescript
// For geographic_map
geo_entity_type?: "deal" | "asset";
geo_filter?: {
  market?: string;
  region?: string;
  fund_id?: string;
};
geo_cluster?: boolean;  // enable/disable point clustering
linked_table_id?: string;
```

### 2B. Frontend Component (`repo-b/src/components/repe/dashboards/widgets/GeographicMapWidget.tsx`)

Thin wrapper around the existing `DealGeoIntelligencePanel`. Adapts the dashboard WidgetConfig props to the panel's expected props.

```tsx
"use client";
import React from "react";
import type { WidgetConfig } from "@/lib/dashboards/types";
// Read DealGeoIntelligencePanel props before writing this wrapper
// The component lives at: repo-b/src/components/repe/pipeline/geo/DealGeoIntelligencePanel.tsx
// Read it first, then adapt

interface Props {
  config: WidgetConfig;
  envId: string;
  businessId: string;
  onPointClick?: (dealId: string) => void;
}

export function GeographicMapWidget({ config, envId, businessId, onPointClick }: Props) {
  // TODO: Read DealGeoIntelligencePanel's actual prop interface before writing this.
  // Import and render it with the config values mapped to its props.
  return null; // placeholder — implement after reading the source component
}
```

**Critical:** Read `DealGeoIntelligencePanel.tsx` first to understand its prop interface. Do not guess.

### 2C. Intent → Widget Mapping

Add to `SECTION_PHRASES` in `dashboard_composer.py`:
```python
"geographic_analysis": re.compile(
    r"\b(map|geography|geographic|geo\s+intel|market\s+distribution|"
    r"locations?|assets?\s+by\s+region|regional\s+distribution|"
    r"where\s+are|spatial)\b",
    re.IGNORECASE,
),
```

Map `geographic_analysis` section → `geographic_map` widget type.

### 2D. Table Inference for Map

When `geographic_map` is in the dashboard, auto-add a deal/asset table below it. The table filters by `market` or `region` when user clicks a map point.

### Test Task 2

```bash
# Send: "build me a market dashboard for the Southeast"
# Expected: dashboard_spec contains widget type: "geographic_map"
# Verify DealGeoIntelligencePanel renders inside the widget grid
```

---

## Task 3 — Spec File Round-Trip

**Goal:** When a dashboard is generated from a markdown spec in `docs/dashboard_requests/`, store the originating spec path in `re_dashboard.spec_file` and expose an "Edit source spec" link in the UI.

### 3A. Database Migration

**File: `repo-b/db/schema/331_re_dashboard_spec_file.sql`**

```sql
ALTER TABLE re_dashboard
  ADD COLUMN IF NOT EXISTS spec_file text;

COMMENT ON COLUMN re_dashboard.spec_file IS
  'Relative path to the originating markdown spec (e.g. docs/dashboard_requests/fund_quarterly.md). NULL if generated from natural language.';
```

Apply via Supabase migration tool. Do NOT use raw `psql` or `ALTER TABLE` in production without a migration record.

### 3B. Pass `spec_file` Through the Generate Route

**File: `repo-b/src/app/api/re/v2/dashboards/generate/route.ts`**

The route already accepts `spec_file` as a query parameter for resolving the markdown file. Extend it to also:
1. Persist `spec_file` to the `re_dashboard` row when saving
2. Return `spec_file` in the response JSON

Find the `INSERT INTO re_dashboard` statement (or the save logic) and add `spec_file` to the insert.

### 3C. "Edit source spec" UI Link

**File: wherever the saved dashboard header is rendered** (likely `DashboardRenderer.tsx` header or the dashboard detail page)

If `dashboard.spec_file` is present, render a link:
```tsx
{dashboard.spec_file && (
  <a
    href={`/api/re/v2/dashboards/spec/${encodeURIComponent(dashboard.spec_file)}`}
    className="text-xs text-bm-muted hover:text-bm-text underline"
    target="_blank"
    rel="noopener noreferrer"
  >
    Edit source spec →
  </a>
)}
```

### 3D. Spec Viewer/Edit Route

**File: `repo-b/src/app/api/re/v2/dashboards/spec/[...path]/route.ts`**

Returns the raw markdown content of the spec file so users can view or edit it. Returns 404 if path is outside `docs/dashboard_requests/` (path traversal protection).

```typescript
export async function GET(request: Request, { params }: { params: { path: string[] } }) {
  const relativePath = params.path.join("/");
  // Security: only allow paths within docs/dashboard_requests/
  if (!relativePath.startsWith("docs/dashboard_requests/") || relativePath.includes("..")) {
    return new Response("Forbidden", { status: 403 });
  }
  // Read file and return as text/markdown
}
```

### 3E. Regeneration Flow

After the user edits the markdown spec file, they can regenerate by calling `POST /api/re/v2/dashboards/generate?spec_file=docs/dashboard_requests/...` again. The existing route already handles this. The UI "Regenerate" button simply calls this endpoint with the stored `spec_file`.

### Test Task 3

```bash
# 1. Generate dashboard from spec:
curl -X POST "http://localhost:3001/api/re/v2/dashboards/generate?spec_file=docs/dashboard_requests/real_estate_fund_dashboard.md&..."
# Expected response includes spec_file in saved dashboard record

# 2. Verify spec_file stored in DB:
SELECT id, name, spec_file FROM re_dashboard WHERE spec_file IS NOT NULL LIMIT 5;

# 3. Fetch spec content:
curl "http://localhost:3001/api/re/v2/dashboards/spec/docs/dashboard_requests/real_estate_fund_dashboard.md"
# Expected: raw markdown text
```

---

## Task 4 — Density Toggle (Expose Existing Compact Mode)

**Goal:** The compact layout already exists server-side (triggers at ≥6 sections). Expose it as a user-controlled toggle.

### 4A. Add `density` to DashboardSpec (`repo-b/src/lib/dashboards/types.ts`)

```typescript
export interface DashboardSpec {
  widgets: DashboardWidget[];
  density?: "comfortable" | "compact";  // NEW — default: "comfortable"
}
```

### 4B. Pass `density` to the Composer

**File: `repo-b/src/app/api/re/v2/dashboards/generate/route.ts`**

Accept `density` as a request body param. Pass it to `compose_dashboard_spec()`.

**File: `backend/app/services/dashboard_composer.py`**

Add `density: str = "auto"` parameter to `compose_dashboard_spec()`. When `density == "compact"`, force compact mode regardless of section count. When `density == "comfortable"`, never compact even with ≥6 sections. When `density == "auto"` (default), use existing threshold logic.

```python
def compose_dashboard_spec(
    message: str,
    env_id: str | None = None,
    ...
    density: str = "auto",          # NEW
) -> dict[str, Any]:
    ...
    # Existing compact logic (lines 311-324):
    if density == "compact":
        compact = True
    elif density == "comfortable":
        compact = False
    else:
        compact = len(sections) >= 6   # existing auto behavior
```

### 4C. Density Toggle UI

**File: wherever the dashboard header/toolbar is rendered** (DashboardRenderer header or dashboard page)

```tsx
function DensityToggle({ value, onChange }: { value: "comfortable" | "compact"; onChange: (v: "comfortable" | "compact") => void }) {
  return (
    <div className="flex rounded border border-bm-border overflow-hidden text-xs">
      {(["comfortable", "compact"] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`px-3 py-1 capitalize ${
            value === mode
              ? "bg-bm-primary text-white"
              : "bg-bm-surface text-bm-muted hover:text-bm-text"
          }`}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
```

When toggled, re-fetch the dashboard with the new density param or recompute widget heights client-side:
- Compact: subtract 1 from each widget's `h` (min 2)
- Comfortable: use original `h` values from spec

Store original `h` values before modifying so comfortable mode can restore them.

### 4D. Store density in `re_dashboard`

**File: `repo-b/db/schema/331_re_dashboard_spec_file.sql`** (add to same migration as Task 3)

```sql
ALTER TABLE re_dashboard
  ADD COLUMN IF NOT EXISTS density text DEFAULT 'comfortable'
    CHECK (density IN ('comfortable', 'compact', 'auto'));
```

### Test Task 4

```bash
# Generate compact dashboard:
# POST /api/re/v2/dashboards/generate with body: { density: "compact" }
# Expected: all widget heights 1 row smaller than comfortable equivalent

# Verify toggle in UI re-renders grid without page reload
```

---

## Task 5 — Widget Fallback Transparency

**Goal:** When a requested widget type cannot be rendered, log clearly and surface a builder message. Currently fails silently.

### 5A. Fallback Logging (Backend)

**File: `backend/app/services/dashboard_composer.py`**

In `_select_widget_for_section()` or wherever widget type is resolved, track when a fallback occurs:

```python
from app.observability.logger import emit_log

def _resolve_widget_type(requested: str, available: set[str]) -> tuple[str, str | None]:
    """Returns (resolved_type, fallback_reason). fallback_reason is None if no fallback."""
    if requested in available:
        return requested, None
    # Fallback map
    fallbacks = {
        "pipeline":           "bar_chart",
        "pipeline_bar":       "bar_chart",
        "geographic_map":     "text_block",
        "sparkline_grid":     "metrics_strip",
        "sensitivity_heat":   "text_block",
    }
    fallback = fallbacks.get(requested, "text_block")
    emit_log(
        level="warning",
        service="backend",
        action="dashboard.widget.fallback",
        message=f"Widget type '{requested}' not available. Using fallback '{fallback}'.",
        context={"requested": requested, "fallback": fallback},
    )
    return fallback, f'Requested widget "{requested}" not available. Using fallback visualization "{fallback}".'
```

### 5B. Expose Fallback in Dashboard Spec

When a fallback occurs, add a `builder_messages` array to the dashboard spec:

```python
dashboard_spec["builder_messages"] = [
    { "level": "warning", "text": fallback_reason }
    for fallback_reason in fallback_reasons
    if fallback_reason
]
```

### 5C. Builder Messages UI

**File: `DashboardRenderer.tsx`**

If `spec.builder_messages` is non-empty, render a collapsible notice at the top:

```tsx
{spec.builder_messages?.length > 0 && (
  <details className="mb-3 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
    <summary className="cursor-pointer text-amber-400 font-medium">
      ⚠ Builder messages ({spec.builder_messages.length})
    </summary>
    <ul className="mt-2 space-y-1 text-bm-muted">
      {spec.builder_messages.map((msg, i) => (
        <li key={i}>{msg.text}</li>
      ))}
    </ul>
  </details>
)}
```

### 5D. Add `builder_messages` to Types

```typescript
export interface DashboardSpec {
  widgets: DashboardWidget[];
  density?: "comfortable" | "compact";
  builder_messages?: Array<{ level: "info" | "warning" | "error"; text: string }>;
}
```

### Test Task 5

```bash
# Request a dashboard with a stubbed widget type, e.g. "sparkline_grid"
# Expected: builder_messages contains: "Requested widget 'sparkline_grid' not available. Using fallback visualization 'metrics_strip'."
# Expected: backend log shows action: "dashboard.widget.fallback"
# Expected: UI shows amber warning notice at top of dashboard
```

---

## Task 6 — Intent → Widget Mapping (Formalize and Extend)

**Goal:** The mapping from natural language keywords to widget types currently lives scattered across `dashboard_composer.py`. Extract it into an explicit, documented, testable mapping layer.

### 6A. Intent → Widget Map (`backend/app/services/dashboard_composer.py`)

Add an explicit mapping at the top of the file (before the archetypes):

```python
# Maps detected section intent → widget type
# Checked BEFORE fallback logic. Add new widget types here when implemented.
INTENT_WIDGET_MAP: dict[str, str] = {
    # Pipeline
    "pipeline_analysis":     "pipeline_bar",
    "deal_flow":             "pipeline_bar",
    "deal_stages":           "pipeline_bar",
    "opportunities":         "pipeline_bar",
    # Geographic
    "geographic_analysis":   "geographic_map",
    "market_distribution":   "geographic_map",
    "geo_intel":             "geographic_map",
    # Financial time-series
    "noi_trend":             "trend_line",
    "occupancy_trend":       "trend_line",
    "dscr_monitoring":       "trend_line",
    # Financial comparisons
    "actual_vs_budget":      "bar_chart",
    "debt_maturity":         "bar_chart",
    "income_statement":      "statement_table",
    "cash_flow":             "statement_table",
    "noi_bridge":            "waterfall",
    "underperformer_watchlist": "comparison_table",
    # Structural
    "kpi_summary":           "metrics_strip",
    "downloadable_table":    "statement_table",
}

# AVAILABLE_WIDGET_TYPES — the set that WidgetRenderer can currently render.
# Stubbed types (sparkline_grid, sensitivity_heat) are intentionally excluded.
AVAILABLE_WIDGET_TYPES: set[str] = {
    "metric_card", "metrics_strip", "trend_line", "bar_chart",
    "waterfall", "statement_table", "comparison_table", "text_block",
    "pipeline_bar",    # Added in Task 1
    "geographic_map",  # Added in Task 2
}
```

Replace any inline `if/elif` widget type resolution with `INTENT_WIDGET_MAP.get(detected_intent)`, then fall through to `_resolve_widget_type()` (fallback logger from Task 5).

### 6B. Table Inference Rules

**File: `backend/app/services/dashboard_composer.py`**

Add a `TABLE_INFERENCE_RULES` dict that maps widget types to auto-added companion table sections:

```python
TABLE_INFERENCE_RULES: dict[str, dict] = {
    "pipeline_bar": {
        "widget_type": "statement_table",
        "title": "Deal Pipeline",
        "subtitle": "All active deals",
        "config": {
            "data_source": "repe_deal",
            "columns": ["deal_name", "market", "equity_required", "target_irr", "deal_status"],
            "statement": None,
        },
        "layout": {"w": 12, "h": 4},
    },
    "geographic_map": {
        "widget_type": "statement_table",
        "title": "Deal / Asset Detail",
        "subtitle": "Filtered by selected region",
        "config": {
            "data_source": "repe_deal",
            "columns": ["deal_name", "market", "asset_class", "deal_status", "equity_required"],
            "statement": None,
        },
        "layout": {"w": 12, "h": 4},
    },
    "waterfall": {
        "widget_type": "comparison_table",
        "title": "Tier Breakdown",
        "config": {"statement": "waterfall_allocations"},
        "layout": {"w": 12, "h": 3},
    },
}
```

In `compose_dashboard_spec()`, after composing the initial widget list, iterate and add companion tables for any widget types that appear in `TABLE_INFERENCE_RULES`.

### Test Task 6

```bash
# Verify mapping layer:
# Send "pipeline" intent → confirm widget type is pipeline_bar, not bar_chart
# Send "map" intent → confirm widget type is geographic_map, not text_block
# Send "NOI trend" intent → confirm widget type is trend_line (unchanged)
# Confirm pipeline dashboard auto-includes a deal table
# Confirm map dashboard auto-includes a deal/asset table
```

---

## Task 7 — Example Dashboard Spec

Create this file to demonstrate the new widget types and serve as a reference for the intent → widget mapping.

**File: `docs/dashboard_requests/pipeline_and_market_dashboard.md`**

```markdown
# Pipeline and Market Dashboard

## Purpose
Visualize the current deal pipeline by stage alongside geographic market distribution.
Show active opportunities grouped by deal_status and their geographic spread across target markets.

## Key Metrics
- Active deal count by stage
- Total equity required in pipeline
- Geographic distribution of deals
- Average target IRR by stage

## Layout
- Pipeline stage bar chart (full width)
- Geographic market map (full width)
- Supporting deal table with stage and market filters

## Entity Scope
- entity_type: portfolio
- quarter: 2026Q1

## Interactions
- Clicking a pipeline stage filters the deal table to that stage
- Clicking a map point filters the deal table to that market

## Visualizations
- pipeline_bar: group by deal_status, value by equity_required
- geographic_map: entity_type deal, filter by market

## Table Behavior
- include deal table: yes
- table linked to: pipeline_bar, geographic_map
- table columns: deal_name, market, deal_status, equity_required, target_irr
```

---

## Example: Testing New Functionality

### Backend smoke tests

```bash
# 1. Start backend
cd backend && uvicorn app.main:app --port 8000

# 2. Verify pipeline intent classification
curl -X POST http://localhost:8000/v1/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "show me deal pipeline stages", "env_id": "...", "business_id": "..."}'
# Expected SSE: result_type "dynamic_dashboard", spec.widgets[0].type = "pipeline_bar"

# 3. Verify map intent classification
curl -X POST http://localhost:8000/v1/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "build me a geographic market dashboard", "env_id": "...", "business_id": "..."}'
# Expected SSE: result_type "dynamic_dashboard", spec contains widget type "geographic_map"

# 4. Run backend tests
cd backend && make test-backend
```

### Frontend smoke tests

```bash
cd repo-b && make test-frontend

# Manual browser tests:
# 1. Navigate to any page with command bar
# 2. Type "show me a pipeline dashboard"
# 3. Confirm: command bar shows "Generating dashboard..."
# 4. Confirm: DashboardRenderer renders with PipelineBarWidget visible
# 5. Click a pipeline stage bar
# 6. Confirm: deal table below filters to that stage
# 7. Toggle Compact/Comfortable — confirm grid heights change without reload
```

---

## Modified Files

| File | Task | Change |
|---|---|---|
| `repo-b/src/lib/dashboards/types.ts` | 1A, 4A, 5D | Add `pipeline_bar`, `geographic_map` widget types; add `density`, `builder_messages` to DashboardSpec |
| `backend/app/services/dashboard_composer.py` | 1E, 2C, 4B, 5A, 6A, 6B | Add INTENT_WIDGET_MAP, pipeline_bar/geographic_map sections, density param, fallback logging, TABLE_INFERENCE_RULES |
| `repo-b/src/app/api/re/v2/dashboards/generate/route.ts` | 4B, 3B | Pass density param; persist spec_file |
| `repo-b/src/lib/commandbar/store.ts` | 0A | Handle `dynamic_dashboard` result type |
| `repo-b/src/components/repe/dashboards/WidgetRenderer.tsx` | 1D, 2B | Add cases for pipeline_bar, geographic_map |

## New Files

| File | Task |
|---|---|
| `repo-b/src/components/repe/dashboards/DashboardRenderer.tsx` | 0B |
| `repo-b/src/app/app/repe/dashboards/[dashboardId]/page.tsx` | 0C |
| `repo-b/src/app/api/re/v2/dashboards/[id]/route.ts` | 0C |
| `repo-b/src/app/api/re/v2/dashboards/pipeline-stages/route.ts` | 1B |
| `repo-b/src/components/repe/dashboards/widgets/PipelineBarWidget.tsx` | 1C |
| `repo-b/src/components/repe/dashboards/widgets/GeographicMapWidget.tsx` | 2B |
| `repo-b/src/app/api/re/v2/dashboards/spec/[...path]/route.ts` | 3D |
| `repo-b/db/schema/331_re_dashboard_spec_file.sql` | 3A, 4D |
| `docs/dashboard_requests/pipeline_and_market_dashboard.md` | 7 |

---

## Durable Insights for `tips.md`

Add this section to `tips.md` under a `## Dashboard Builder` heading:

```markdown
## Dashboard Builder

**Widget types and their render status:**
- Fully rendered: metric_card, metrics_strip, trend_line, bar_chart, waterfall, statement_table, comparison_table, text_block, pipeline_bar, geographic_map
- Stubbed (defined but no renderer): sparkline_grid, sensitivity_heat

**Markdown spec format:**
- Lives in docs/dashboard_requests/*.md
- Required H2 sections: Purpose, Key Metrics, Layout, Entity Scope
- Generate route: POST /api/re/v2/dashboards/generate?spec_file=docs/dashboard_requests/[file].md
- Store spec_file in re_dashboard.spec_file for round-trip editing

**Intent → widget mapping lives in:**
- Backend: backend/app/services/dashboard_composer.py → INTENT_WIDGET_MAP dict
- Frontend sections: repo-b/src/lib/dashboards/layout-archetypes.ts → SECTION_REGISTRY

**Common wrong-widget bug:** If pipeline intent maps to bar_chart (financial time-series), check INTENT_WIDGET_MAP in dashboard_composer.py. "pipeline_analysis" must map to "pipeline_bar", not "bar_chart".

**Density:**
- Auto-compact triggers at ≥6 sections (reduces widget height by 1 row, min 3)
- Override with: compose_dashboard_spec(density="compact"|"comfortable"|"auto")
- UI toggle in DashboardRenderer header

**Fallback transparency:**
- Fallback widget selection logs to observability with action "dashboard.widget.fallback"
- Surfaced in dashboard spec as spec.builder_messages[]
- Rendered in UI as amber warning notice (collapsible)

**Table inference:**
- pipeline_bar → auto-add deal table (columns: deal_name, market, deal_status, equity_required)
- geographic_map → auto-add deal/asset table
- Table filters update when user clicks chart or map via linked_table_id in WidgetConfig

**Route pattern:**
- Dashboard generate: Pattern B (Next.js route handler, direct Postgres) at /api/re/v2/dashboards/
- Dashboard composition: backend FastAPI service at dashboard_composer.py
- Never put composition logic in the Next.js route handler
```

---

## Prerequisites to Verify Before Building

1. **Recharts in repo-b package.json** — If missing: `cd repo-b && npm install recharts`
2. **`repe_deal` column names** — Read the actual schema for `deal_status`, `equity_required`, `deal_value`, `market`, `fund_id` before writing SQL
3. **DealGeoIntelligencePanel prop interface** — Read the component before writing the wrapper
4. **INTENT_GENERATE_DASHBOARD regex ordering** — Verify pipeline/map patterns are checked before the generic dashboard regex to prevent over-matching
5. **Tailwind CSS grid dynamic class purge** — Confirm approach: use inline `style` for `gridColumn`/`gridRow`, or add safelist to `tailwind.config.ts` for `col-span-{1-12}` and `row-span-{1-12}`
6. **`330_re_dashboards.sql` layout_archetype CHECK constraint** — Verify the constraint includes all archetype values before adding new ones
7. **DB migration sequence** — Verify next migration number is 331 (count existing files in `repo-b/db/schema/`)

---

## Execution Order

**Phase 0 (gate — do this first):** Task 0 — DashboardRenderer + SSE handler + page route
**Phase 1 (new widgets):** Tasks 1 + 2 in parallel
**Phase 2 (developer ergonomics):** Tasks 3 + 4 + 5 in parallel
**Phase 3 (intelligence layer):** Task 6 — INTENT_WIDGET_MAP + TABLE_INFERENCE_RULES
**Phase 4 (reference artifacts):** Task 7 — Example spec + tips.md updates

Run `make test-frontend` and `make test-backend` after each phase. Include actual terminal output.

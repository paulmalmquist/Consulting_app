# Claude Code Prompt — Diagnose Empty Dashboard Bug

Paste this into VS Code Claude Code extension:

---

```
I have a bug where AI-generated dashboards render empty — the layout loads but no widgets populate. Trace the full pipeline and find where it breaks.

## Architecture (all in this repo)

- **Frontend:** Next.js 14 in `repo-b/src/`
- **Dashboard generate API:** `repo-b/src/app/api/re/v2/dashboards/generate/route.ts` (this is a Next.js API route, NOT a FastAPI call — the generation is deterministic pattern-matching, not LLM)
- **Dashboard CRUD API:** `repo-b/src/app/api/re/v2/dashboards/route.ts`
- **Dashboard page:** `repo-b/src/app/lab/env/[envId]/re/dashboards/page.tsx`
- **Dashboard detail page:** `repo-b/src/app/lab/env/[envId]/re/dashboards/[dashboardId]/page.tsx`

## Key Components

| Component | File |
|-----------|------|
| DashboardPrompt (input) | `repo-b/src/components/repe/dashboards/DashboardPrompt.tsx` |
| DashboardCanvas (grid) | `repo-b/src/components/repe/dashboards/DashboardCanvas.tsx` |
| WidgetRenderer (renders each widget) | `repo-b/src/components/repe/dashboards/WidgetRenderer.tsx` |
| WidgetConfigPanel (right rail) | `repo-b/src/components/repe/dashboards/WidgetConfigPanel.tsx` |
| DashboardToolbar | `repo-b/src/components/repe/dashboards/DashboardToolbar.tsx` |
| Types | `repo-b/src/lib/dashboards/types.ts` |
| Metric catalog | `repo-b/src/lib/dashboards/metric-catalog.ts` |
| Layout archetypes | `repo-b/src/lib/dashboards/layout-archetypes.ts` |
| Spec validator | `repo-b/src/lib/dashboards/spec-validator.ts` |

## How Generation Currently Works

1. User types prompt in `DashboardPrompt.tsx` → calls `onGenerate(prompt)`
2. `page.tsx` line 69: `handleGenerate` does `POST /api/re/v2/dashboards/generate` with `{prompt, env_id, business_id, quarter}`
3. `generate/route.ts` does deterministic pattern matching (NOT an LLM call):
   - `detectArchetype(prompt)` → matches to executive_summary/operating_review/watchlist/market_comparison
   - `detectScope(prompt)` → determines entity_type (asset/investment/fund)
   - `detectMetrics(prompt)` → maps keywords to METRIC_CATALOG keys
   - `composeDashboard()` → assembles widget specs from archetype slots + detected metrics
   - `validateDashboardSpec()` → validates the spec
4. Returns `{name, spec: {widgets: [...]}, layout_archetype, validation, entity_names}`
5. `page.tsx` line 84: `if (data.spec?.widgets) { setWidgets(data.spec.widgets) }` → switches to builder view
6. `DashboardCanvas` renders widgets via `WidgetRenderer`
7. `WidgetRenderer` line 26-84: `useWidgetData()` hook fetches data from `/api/re/v2/assets/{id}/statements` or `/api/re/v2/investments/{id}/statements`

## The Bug

When the user enters a prompt like "Build a dashboard for multifamily assets with NOI, occupancy, DSCR and debt maturity" and presses Generate, the page navigates to the builder view but the dashboard is empty — no widgets render.

## What To Investigate

### Stage 1: Does the generate API return widgets?
Read `generate/route.ts` and trace what `composeDashboard()` returns. Add a `console.log` at line 54 to log the response. Check if `spec.widgets` is actually populated or empty.

### Stage 2: Does the frontend receive and set widgets?
In `page.tsx` the `handleGenerate` function (line 69-96) has a `catch` block that silently swallows errors. Check:
- Is the fetch succeeding?
- Is `data.spec?.widgets` truthy?
- Does `setWidgets` actually get called?
- Add `console.log("Generate response:", data)` after line 83

### Stage 3: Does DashboardCanvas receive widgets?
Read `DashboardCanvas.tsx` — does it receive `widgets` prop and actually iterate over them? Is there a condition that filters them all out?

### Stage 4: Does WidgetRenderer render anything?
In `WidgetRenderer.tsx` the `useWidgetData()` hook (line 40) returns early with `setData(null)` if `!entityIds?.length || !effectiveQuarter`. This is likely the problem:
- The generated widgets get `entity_ids` from `scope.entity_ids` in `composeDashboard()`
- But in `detectScope()` (route.ts line 84-95), `entity_ids` is only set if the user passes them explicitly
- If no `entity_ids` are provided, every widget has `entity_ids: undefined`
- Then `useWidgetData()` line 40 hits `!entityIds?.length` → returns null → widget shows empty

### Stage 5: Gallery vs Builder view logic
In `page.tsx` line 155: `if (view === "gallery" && widgets.length === 0)` controls which view renders. After generation, `setView("builder")` is called (line 88). But check if there's a race condition where `widgets` is still empty when the view switches.

## Most Likely Root Cause (verify this)

`WidgetRenderer.tsx` line 40:
```
if (!entityIds?.length || !effectiveQuarter) {
  setData(null);
  return;
}
```

The generate route's `detectScope()` only populates `entity_ids` if the user explicitly passes them. For a freeform prompt like "Build a dashboard for multifamily assets", no entity_ids are detected, so every widget gets `entity_ids: undefined`, and every WidgetRenderer bails out with no data.

The fix should be one of:
1. When no entity_ids are provided, query available entities for the env_id/business_id and auto-populate
2. Make WidgetRenderer handle the "no entity selected" state gracefully (show placeholder or selection UI)
3. After generation, prompt the user to select specific entities before rendering

## Deliverables

1. Confirm or correct my root cause analysis above
2. Add console.log statements at each stage to trace the actual data flow
3. Propose a fix that handles the case where entity_ids are not specified in the prompt
4. If the root cause is different, identify the exact file and line where the pipeline breaks
5. Don't make changes until I review your findings — investigate only
```

---

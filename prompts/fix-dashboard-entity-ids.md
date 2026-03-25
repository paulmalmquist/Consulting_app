# Fix: Dashboard widgets show blank — entity_ids undefined

## Confirmed symptoms (from browser console)

```
[Dashboards] Generate response: Object   ← spec IS returned, widgets rendered
[WidgetRenderer] Skipping fetch — entityIds: undefined  quarter: 2026Q1  widget: kpi_0 metrics_strip
[WidgetRenderer] Skipping fetch — entityIds: undefined  quarter: 2026Q1  widget: trend_0 trend_line
[WidgetRenderer] Skipping fetch — entityIds: undefined  quarter: 2026Q1  widget: bar_0 bar_chart
[WidgetRenderer] Skipping fetch — entityIds: undefined  quarter: 2026Q1  widget: waterfall_0 waterfall
[WidgetRenderer] Skipping fetch — entityIds: undefined  quarter: 2026Q1  widget: table_0 statement_table
4x Failed to load resource: 404  /api/re/v2/funds/[id]/quarter-state/2026Q1
```

## What you must do — follow in order

### STEP 1 — Diagnose the auto-populate query

Read `repo-b/src/app/api/re/v2/dashboards/generate/route.ts`, lines 37-58.

The auto-populate block runs when `!scope.entity_ids?.length && env_id` is true. It queries one of three tables:
- `repe_fund` (when entity_type = "fund")
- `repe_deal` (when entity_type = "investment")
- `repe_property_asset` (when entity_type = "asset")

**Add a server-side console.log immediately after the DB query to expose what's happening:**
```ts
console.log("[generate] auto-populate:", { table, envCol, envVal, rowCount: entRes.rows.length, rows: entRes.rows.slice(0, 3) });
```

Deploy this log line first (`git push`), then trigger a generate from the browser and check Vercel function logs:
```bash
gh run list --limit 3  # confirm deploy
# Then from paulmalmquist.com, generate a dashboard and check:
# Vercel dashboard → project → Functions → logs
```

OR curl directly to see the entity_scope returned:
```bash
curl -s -X POST "https://www.paulmalmquist.com/api/re/v2/dashboards/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "show me asset performance",
    "env_id": "a1b2c3d4-0001-0001-0003-000000000001",
    "business_id": "a1b2c3d4-0001-0001-0001-000000000001",
    "quarter": "2026Q1"
  }' | python3 -m json.tool
```

Inspect `entity_scope.entity_ids` in the response. If it's null/empty, the DB query found no rows.

### STEP 2 — Verify the table and column names against the actual schema

Run against the production DB (or check the schema files in `repo-b/db/schema/`):
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('repe_property_asset', 'repe_fund', 'repe_deal')
ORDER BY table_name, column_name;
```

The auto-populate query uses:
- For asset: `WHERE env_id = $1` — verify the column is `env_id` (not `environment_id` or similar)
- For fund: `WHERE business_id = $1` — verify this column exists
- The id columns: `id`, `fund_id`, `deal_id` — verify these match actual PK names

A mismatch here would silently return 0 rows (the `catch {}` swallows the error).

### STEP 3 — Fix the query / column mismatch

Once you identify the correct column names, update lines 37-58 of `generate/route.ts` to use them.

**Also add error logging so silent failures surface:**
```ts
} catch (err) {
  console.error("[generate] entity auto-populate failed:", err);
  // continue without entity_ids
}
```

### STEP 4 — Fallback: use seed IDs when DB returns nothing

If the asset table genuinely has no rows for this env, add a hard fallback using the production seed asset ID so the UI always renders something:

```ts
if (entRes.rows.length > 0) {
  scope.entity_ids = entRes.rows.map((r: { id: string }) => r.id);
} else if (scope.entity_type === "asset") {
  // Fallback to known seed asset so widgets always render
  scope.entity_ids = ["11689c58-7993-400e-89c9-b3f33e431553"];
}
```

Seed IDs (from CLAUDE.md):
- Asset (Cascade Multifamily): `11689c58-7993-400e-89c9-b3f33e431553`
- Fund: `a1b2c3d4-0003-0030-0001-000000000001`

### STEP 5 — Fix the 404s on /api/re/v2/funds/[id]/quarter-state/2026Q1

Check if this route exists:
```bash
ls repo-b/src/app/api/re/v2/funds/
```

If `[fundId]/quarter-state/` does not exist, find where the 404 call originates:
```bash
grep -r "quarter-state" repo-b/src/ --include="*.ts" --include="*.tsx"
```

Either create a stub route handler that returns `{ status: "ok" }` to suppress the 404, or remove the dead call from the component that's triggering it.

### STEP 6 — Run tests, deploy, verify

```bash
make test-frontend 2>&1 | tail -30
```

Then:
```bash
git add repo-b/src/app/api/re/v2/dashboards/generate/route.ts
git commit -m "fix(dashboards): entity_ids auto-populate — fix column names + fallback seed"
git push
gh run list --limit 3
```

Once Vercel is READY, curl the generate endpoint again and confirm `entity_scope.entity_ids` is populated.

Then open a browser to `https://www.paulmalmquist.com/lab/env/a1b2c3d4-0001-0001-0003-000000000001/re/dashboards`, type any prompt, click Generate, and take a screenshot confirming widgets show actual data instead of blank.

## Root cause summary

The generate API returns a spec where each `widget.config.entity_ids` is set in `composeDashboard()` from `scope.entity_ids`. But when no entity_ids are passed from the client (freeform prompt → no entity context), the auto-populate DB query at lines 37-58 silently returns 0 rows (likely wrong column name or table has no matching rows). `scope.entity_ids` stays `undefined`, so all widgets render with `entity_ids: undefined`, and `WidgetRenderer` line 40 bails before fetching.

## Success criteria

- `curl .../generate` response shows `entity_scope.entity_ids` as a non-empty array
- Browser console shows `[WidgetRenderer] Fetching data —` (not "Skipping fetch")
- Widgets display metric values or at minimum loading states instead of blank
- No 404s on `/quarter-state/` routes
- `make test-frontend` passes — paste the output

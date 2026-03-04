# Winston — Data Integrity & Model Creation Sprint

> Paste this as the **system context** when opening a new Claude Code session.
> These are the findings from a live institutional REPE fund manager walkthrough of the deployed platform.
> Fix every item below in priority order. Do not skip any. Commit after each logical group.

---

## Context

- **Repo**: `repo-b/` — Next.js 14 App Router on Vercel
- **Backend**: `backend/` — FastAPI on Railway (`BOS_API_ORIGIN`)
- **DB**: Supabase PostgreSQL, project ID `ozboonlsplroialdwuxj`
- **Main fund page**: `src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx`
- **BOS proxy**: `src/app/bos/[...path]/route.ts` forwards to FastAPI
- **Direct DB routes**: `src/app/api/re/v2/...` use `getPool()` from `src/lib/server/db.ts`
- **bosFetch**: Routes through `/bos/` proxy to FastAPI. Use regular `fetch('/api/...')` for direct-DB operations.

---

## Priority 0 — Model Creation (BROKEN, no data persists)

**Symptom**: Models page at `/lab/env/{envId}/re/models` has a working UI form (Name, Description, Equity type dropdown, Create Model button) but clicking Create Model does nothing — no model is persisted.

**Root cause** (already diagnosed):
- `src/app/lab/env/[envId]/re/models/page.tsx` calls `createModel()` using `bosFetch('/api/re/v2/funds/{fundId}/models', { method: 'POST', ... })`
- `bosFetch` routes through `/bos/` proxy → FastAPI. FastAPI has **no** `POST /api/re/v2/funds/{fundId}/models` endpoint.
- The Next.js direct-DB route at `src/app/api/re/v2/funds/[fundId]/models/route.ts` only has `GET`, no `POST`.
- Additionally, `listModels()` also uses `bosFetch`, so models are being fetched from FastAPI (returns 404/empty) rather than from the direct-DB route.

**Fix sequence**:

1. **Check if `re_model` table exists**:
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 're_model' AND table_schema = 'public';
   ```
   If missing, apply migration:
   ```sql
   CREATE TABLE IF NOT EXISTS public.re_model (
     model_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     fund_id    uuid NOT NULL REFERENCES public.repe_fund(fund_id) ON DELETE CASCADE,
     name       text NOT NULL,
     description text,
     status     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
     strategy_type text,
     created_by text,
     approved_at timestamptz,
     approved_by text,
     created_at timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS re_model_fund_id_idx ON public.re_model(fund_id);
   ```
   Use `apply_migration` with name `create_re_model_table`.

2. **Add `POST` handler to the Next.js route** (`src/app/api/re/v2/funds/[fundId]/models/route.ts`):
   ```typescript
   export async function POST(
     request: Request,
     { params }: { params: { fundId: string } }
   ) {
     const pool = getPool();
     if (!pool) return Response.json({ error: "No pool" }, { status: 500 });
     const body = await request.json();
     const { name, description, strategy_type } = body;
     if (!name?.trim()) return Response.json({ error: "name required" }, { status: 400 });
     try {
       const res = await pool.query(
         `INSERT INTO re_model (fund_id, name, description, strategy_type, status)
          VALUES ($1::uuid, $2, $3, $4, 'draft')
          RETURNING model_id::text, fund_id::text, name, description, status, strategy_type, created_by, created_at::text`,
         [params.fundId, name.trim(), description?.trim() || null, strategy_type || null]
       );
       return Response.json(res.rows[0], { status: 201 });
     } catch (err) {
       console.error("[re/v2/funds/[fundId]/models POST]", err);
       return Response.json({ error: "Internal error" }, { status: 500 });
     }
   }
   ```

3. **Fix the models page client** (`src/app/lab/env/[envId]/re/models/page.tsx`):
   Change both `listModels` and `createModel` to use regular `fetch` hitting the Next.js API directly (not `bosFetch`):
   ```typescript
   async function listModels(fundId: string): Promise<ReModel[]> {
     const res = await fetch(`/api/re/v2/funds/${fundId}/models`);
     if (!res.ok) return [];
     return res.json();
   }

   async function createModel(fundId: string, body: { name: string; description?: string; strategy_type?: string }): Promise<ReModel> {
     const res = await fetch(`/api/re/v2/funds/${fundId}/models`, {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(body),
     });
     if (!res.ok) {
       const err = await res.json().catch(() => ({}));
       throw new Error(err.error || `HTTP ${res.status}`);
     }
     return res.json();
   }
   ```

4. Run `npx tsc --noEmit` in `repo-b/` to verify no TypeScript errors, then commit.

---

## Priority 1 — Gross → Net Bridge Disconnected from IRR Source

**Symptom**: Performance tab shows `Gross Return = $0` in the bridge table, yet `Gross IRR = 12.4%`. These are contradictory — if gross return is zero, gross IRR cannot be 12.4%.

**Root cause investigation**:
- Bridge data comes from `re_gross_net_bridge_qtr` table (columns: `gross_return`, `mgmt_fees`, `fund_expenses`, `carry_shadow`, `net_return`)
- IRR data comes from `re_fund_metrics_qtr` table (columns: `gross_irr`, `net_irr`, etc.)
- Both tables have a `created_at` column (added via prior migration `add_created_at_to_metrics_and_bridge_tables`)
- The bridge `gross_return` field is likely null or $0 in the DB — it was never populated by the quarter-close computation

**Fix sequence**:

1. **Diagnose**: Run in Supabase (`execute_sql`, project `ozboonlsplroialdwuxj`):
   ```sql
   SELECT gross_return, mgmt_fees, fund_expenses, carry_shadow, net_return, created_at
   FROM re_gross_net_bridge_qtr
   ORDER BY created_at DESC LIMIT 5;

   SELECT gross_irr, net_irr, gross_tvpi, net_tvpi, dpi, created_at
   FROM re_fund_metrics_qtr
   ORDER BY created_at DESC LIMIT 5;
   ```

2. **Backend fix** (FastAPI `backend/app/routes/re_financial_intelligence.py`):
   Find the quarter-close or FI computation that writes to `re_gross_net_bridge_qtr`. Ensure `gross_return` is populated as the actual gross portfolio return in dollar terms (sum of NAV change + realized proceeds before fees). If the field is being set to `None` or `0`, trace the computation and fix.

3. **Frontend defensive fix** (`page.tsx`, `ReturnsTab` / bridge display section):
   If `gross_return` is null/0, show `"—"` rather than `"$0"` to avoid the contradiction. Add a warning tooltip: `"Bridge not yet computed — run Quarter Close to populate"`.

---

## Priority 2 — Gross→Net Spread Showing Wrong Value (3bps vs ~250bps)

**Symptom**: The `"G→N Spread"` metric card shows ~3bps when it should show ~250bps (since gross IRR = 12.4% and net IRR = ~9.9%).

**Root cause**: The spread calculation is likely `gross_irr - net_irr` being treated as basis points directly, when both values are stored as decimals (e.g. 0.124 and 0.099). The spread should be `(gross_irr - net_irr) * 10000` to convert to basis points.

**Fix** in `page.tsx`:
Find the `ReturnsTab` or wherever spread is calculated. Change:
```typescript
// Wrong — spread = 0.124 - 0.099 = 0.025 → "25bps" or even "3bps" if rounding differently
const spread = grossIrr - netIrr;
```
to:
```typescript
// Correct — spread in basis points
const spreadBps = Math.round((grossIrr - netIrr) * 10000);
// Display as: "250 bps"
```

Also verify the metric card label says `"G→N Spread"` (not just `"Spread"`) and the tooltip says `"Gross IRR minus Net IRR, in basis points"`.

---

## Priority 3 — Wtd Avg Cap Rate Displaying ~23.95% (Should Be ~5–7%)

**Symptom**: The weighted average cap rate for the portfolio shows 23.95%, which is physically impossible for institutional REPE assets.

**Root cause (likely)**: Cap rates are stored as decimals (e.g., `0.055` for 5.5%) but are being displayed after multiplying by 100 twice, OR the weighting logic is summing raw cap rates without proper weight normalization (sum of cap_rate instead of weighted_avg_cap_rate).

**Fix sequence**:

1. **Diagnose**: Check the DB value:
   ```sql
   SELECT cap_rate, noi, value_estimate
   FROM re_asset
   LIMIT 10;
   ```
   Determine if `cap_rate` is stored as a decimal (0.055) or percentage (5.5).

2. **Fix the computation** wherever weighted avg cap rate is calculated:
   ```typescript
   // If stored as decimal (0.055 = 5.5%):
   const wtdAvgCapRate = assets.reduce((sum, a) => sum + (a.cap_rate * a.value_estimate), 0)
     / assets.reduce((sum, a) => sum + a.value_estimate, 0);
   // Display: fmtPercent(wtdAvgCapRate) — should yield ~5.5%

   // NOT: cap_rate * 100 * 100, or sum(cap_rate) / count
   ```

3. If cap rates are stored as raw percentages (5.5 not 0.055), the `fmtPercent` helper must divide by 100 before formatting.

---

## Priority 4 — Waterfall Allocation Components All $0 (Math Broken)

**Symptom**: In the Waterfall Scenario or LP Summary tab, waterfall allocation rows show sub-components (return of capital, preferred return, catch-up, carry) all as $0, but the totals are non-zero. This means the total is coming from a different source than the components.

**Root cause (likely)**: The `re_waterfall_run_result` table rows exist but tier amounts are `null` or `0`. The total in the UI is being pulled from a different aggregated field.

**Fix sequence**:

1. **Diagnose**:
   ```sql
   SELECT tier_name, tier_amount, tier_order, run_id
   FROM re_waterfall_run_result
   ORDER BY created_at DESC LIMIT 20;
   ```

2. **FastAPI fix**: In the waterfall calculation (`backend/`), ensure each tier writes its computed amount to `re_waterfall_run_result.tier_amount`. Trace the waterfall loop and verify the INSERT/UPDATE is actually persisting dollar amounts, not nulls.

3. **Frontend fix**: In `WaterfallTierTable.tsx` or wherever the breakdown renders, add a guard: if all tier amounts are null/0 but total is non-zero, show an alert: `"Tier detail unavailable — re-run waterfall to populate breakdown"`.

---

## Priority 5 — Replace All Raw DB Enum Strings with Human-Readable Labels

**Symptom**: Throughout the UI, raw database enum values appear instead of labels:
- `QUARTER_CLOSE` → should be `"Quarter Close"`
- `WATERFALL_SCENARIO` → should be `"Waterfall Scenario"`
- `COVENANT_TEST` → should be `"Covenant Test"`
- `return_of_capital` → should be `"Return of Capital"`
- `MGMT_FEE_PROP` → should be `"Property Management Fee"`
- `preferred_equity` → should be `"Preferred Equity"`
- Status `draft` / `approved` → `"Draft"` / `"Approved"` (capitalize)

**Fix**: Add a shared label mapping utility. In `src/lib/labels.ts` (create if absent):
```typescript
export const RUN_TYPE_LABELS: Record<string, string> = {
  QUARTER_CLOSE: "Quarter Close",
  WATERFALL_SHADOW: "Waterfall Shadow",
  WATERFALL_SCENARIO: "Waterfall Scenario",
  COVENANT_TEST: "Covenant Test",
};

export const WATERFALL_TIER_LABELS: Record<string, string> = {
  return_of_capital: "Return of Capital",
  preferred_return: "Preferred Return",
  catch_up: "Catch-Up",
  carried_interest: "Carried Interest",
};

export const FEE_TYPE_LABELS: Record<string, string> = {
  MGMT_FEE_PROP: "Property Management Fee",
  MGMT_FEE_ASSET: "Asset Management Fee",
  ACQUISITION_FEE: "Acquisition Fee",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  archived: "Archived",
};

export function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
```

Then search all `.tsx` files that render run types, tier names, fee codes, or status strings and replace with `label(RUN_TYPE_LABELS, run.run_type)` etc.

---

## Priority 6 — Variance Tab: Duplicate Line Items

**Symptom**: The Asset Variance tab (NOI variance) shows the same line items twice — e.g., "Rental Revenue" appears as two rows with identical values.

**Root cause (likely)**: The query joining `re_investment_asset_link` is producing a cartesian product, or the variance records are being inserted twice (once per asset and once per investment).

**Fix sequence**:

1. **Diagnose** the NOI variance query in either:
   - `backend/app/routes/re_financial_intelligence.py` (BOS FI endpoint)
   - `src/app/api/re/v2/variance/noi/route.ts` (direct DB route)
   Find the query and add `DISTINCT` or a proper deduplication:
   ```sql
   SELECT DISTINCT ON (line_item_code, period_quarter)
     line_item_code, period_quarter, actual_amount, budget_amount, ...
   FROM re_noi_variance
   WHERE fund_id = $1
   ORDER BY line_item_code, period_quarter, created_at DESC;
   ```

2. Also ensure the frontend deduplicates by `(line_item_code, investment_id)` before rendering if the API can't be fixed immediately:
   ```typescript
   const deduped = Array.from(
     new Map(items.map(item => [`${item.line_item_code}|${item.investment_id}`, item])).values()
   );
   ```

---

## Priority 7 — Fund NAV Per Investment Shows "—" in Overview Table

**Symptom**: The Overview tab's investment rollup table shows `—` for NAV contribution for every investment.

**Root cause (likely)**: `re_investment_quarter_metrics.nav_contribution` is null (not populated by quarter close), OR the Overview table is reading from a different field that doesn't exist.

**Fix sequence**:

1. **Diagnose**:
   ```sql
   SELECT investment_id, nav_contribution, irr, tvpi, quarter
   FROM re_investment_quarter_metrics
   ORDER BY created_at DESC LIMIT 10;
   ```

2. **Backend fix**: In the quarter-close computation (FastAPI), ensure `nav_contribution` is written for each investment. It should be the investment's share of total fund NAV.

3. **Frontend defensive fix**: In the Overview investment table, try alternative fields in priority order:
   ```typescript
   const nav = inv.nav_contribution ?? inv.current_value ?? inv.equity_invested ?? null;
   ```
   Show `fmtMoney(nav)` or `"—"` if all are null.

---

## Priority 8 — Capital Account Snapshots "No snapshots yet" (LP Summary)

**Symptom**: In the LP Summary tab, Capital Account Snapshots section shows "No snapshots yet" even after running Quarter Close.

**Root cause (likely)**: Either (a) quarter close doesn't write snapshot records, or (b) the snapshot query reads from a table/column that doesn't match where data is written.

**Fix sequence**:

1. **Diagnose**: Check what table snapshots come from. Search `page.tsx` and LP Summary tab for "snapshot" — find the data fetch call. Check the corresponding table in Supabase:
   ```sql
   -- Check re_partner_quarter_metrics (most likely candidate)
   SELECT partner_id, quarter, contributed, distributed, nav_share, dpi, tvpi
   FROM re_partner_quarter_metrics
   LIMIT 10;
   ```

2. If the table has data but UI shows empty: the query or API route is filtering incorrectly (wrong fund_id join, wrong env_id, etc.). Fix the filter.

3. If the table is empty: quarter close doesn't write per-partner metrics. Add this step to the quarter-close FastAPI handler: after computing NAV and distributions, write one row per partner per quarter to `re_partner_quarter_metrics`.

---

## Priority 9 — Waterfall Scenario: -20% IRR Swing with Zero-Override Scenario

**Symptom**: The Waterfall Scenario tab shows a scenario comparison where the Scenario IRR is ~20% lower than Base Case even though no assumption overrides have been set (all fields at zero/default).

**Root cause (likely)**: The scenario waterfall is applying zero-value overrides as literal zeros (e.g., exit cap rate = 0%) rather than treating them as "use base case value". This causes catastrophic exit assumptions.

**Fix** in FastAPI (`backend/`):
In the scenario waterfall computation, when an override value is `null`, `0`, or not set, fall through to the base case assumption:
```python
exit_cap_rate = scenario.override_exit_cap_rate or base_case.exit_cap_rate
hold_period = scenario.override_hold_period or base_case.hold_period
# ... etc for all overrides
```

Do NOT apply `0` as a literal assumption — treat it as "no override".

On the frontend, the scenario input form should also initialize all fields to the base case values (not zero), so users see what they're changing from.

---

## Post-Fix Validation Checklist

After all fixes are deployed, run this sequence against the live Vercel URL:

1. **Models**: Go to `/lab/env/{envId}/re/models` → fill in Model Name → click "Create Model" → model appears in the list immediately
2. **Performance tab**: Gross Return in bridge ≠ $0 (should be ~$30–50M for a $400M+ fund). Gross IRR and bridge gross_return tell the same story.
3. **G→N Spread**: Should show ~200–300 basis points (e.g., "247 bps"), not single digits.
4. **Cap Rate**: Wtd Avg Cap Rate should be in the 4–7% range, not 20%+.
5. **Waterfall**: All tier components (ROC, pref return, carry) show non-zero values that sum to the total.
6. **Enum strings**: No raw uppercase_snake_case strings visible anywhere in the UI.
7. **Variance tab**: Each line item (Rental Revenue, OpEx, etc.) appears exactly once.
8. **Overview NAV**: Investment table shows NAV values, not `"—"` for every row.
9. **Capital Account Snapshots**: After running Quarter Close, LP snapshots appear in LP Summary tab.
10. **Waterfall Scenario**: A blank scenario (no overrides) should match Base Case exactly (0% IRR difference).

---

## Key Files Reference

```
repo-b/
├── src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx         ← main fund page
├── src/app/lab/env/[envId]/re/models/page.tsx                 ← models page (Priority 0)
├── src/app/api/re/v2/funds/[fundId]/models/route.ts           ← add POST here (Priority 0)
├── src/lib/labels.ts                                          ← create this (Priority 5)
├── src/components/repe/WaterfallTierTable.tsx
├── src/components/repe/LPBreakdown.tsx
└── src/lib/bos-api.ts

backend/
└── app/routes/re_financial_intelligence.py                    ← FI computations
    (quarter-close, waterfall, FI metrics, NOI variance)
```

## Notes

- Supabase project: `ozboonlsplroialdwuxj`
- Vercel project: `prj_0wG8qDaXVJ5C5y2tKeIYsXqG9iLH`
- Run `npx tsc --noEmit` in `repo-b/` after every change
- Never break the `TABS` constant — tab key strings must stay in sync with the content switch
- Design tokens: `bm-accent`, `bm-surface`, `bm-border`, `bm-muted`, `bm-muted2`, `bm-text`, `font-display`
- Format helpers: `fmtMoney()` (no trailing `.0`), `fmtMultiple()`, `fmtPercent()` — defined at top of `page.tsx`

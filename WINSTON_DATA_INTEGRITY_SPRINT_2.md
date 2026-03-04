# Winston REPE — Data Integrity Sprint 2

> **Context**: Sprint 1 landed the UX redesign, fixed model creation, fixed the spread calculation, and improved LP Summary. This sprint targets the **6 remaining defects** found during live walkthrough verification. Each fix includes the exact file, line, root cause, and minimal code change.

---

## P0 — Variance Table Duplicates (Critical)

**Symptom**: Every NOI line item (ADMIN, RENT, MGMT_FEE_PROP, etc.) appears 2-3× in the Asset Variance tab.

**Root cause**: The variance API returns rows at **(asset_id, line_code)** granularity — one row per asset per line item. A fund with 3 assets produces 3 rows for "RENT". The frontend renders `data.items` flat without aggregating.

**File**: `src/app/api/re/v2/variance/noi/route.ts`

**Fix — Option A (preferred, server-side)**: In the `buildResponse()` function (line 158), aggregate items by `line_code` before returning:

```typescript
function buildResponse(rawItems: Array<Record<string, unknown>>) {
  // Aggregate by line_code across all assets
  const byCode: Record<string, { actual: number; plan: number }> = {};
  for (const item of rawItems) {
    const code = String(item.line_code);
    if (!byCode[code]) byCode[code] = { actual: 0, plan: 0 };
    byCode[code].actual += Number(item.actual_amount) || 0;
    byCode[code].plan += Number(item.plan_amount) || 0;
  }

  const items = Object.entries(byCode).map(([line_code, v]) => ({
    id: line_code,
    line_code,
    actual_amount: v.actual,
    plan_amount: v.plan,
    variance_amount: v.actual - v.plan,
    variance_pct: v.plan !== 0
      ? ((v.actual - v.plan) / Math.abs(v.plan))
      : null,
  }));

  const totalActual = items.reduce((s, i) => s + i.actual_amount, 0);
  const totalPlan = items.reduce((s, i) => s + i.plan_amount, 0);
  const totalVariance = totalActual - totalPlan;

  return Response.json({
    items,
    rollup: {
      total_actual: totalActual.toFixed(2),
      total_plan: totalPlan.toFixed(2),
      total_variance: totalVariance.toFixed(2),
      total_variance_pct: totalPlan !== 0
        ? ((totalActual - totalPlan) / Math.abs(totalPlan)).toFixed(4)
        : null,
    },
  });
}
```

**Fix — Option B (SQL-only)**: Wrap the existing merged CTE with a final GROUP BY:

```sql
SELECT
  line_code,
  SUM(actual_amount) AS actual_amount,
  SUM(plan_amount) AS plan_amount,
  SUM(actual_amount) - SUM(plan_amount) AS variance_amount,
  CASE WHEN SUM(plan_amount) = 0 THEN NULL
       ELSE ROUND(((SUM(actual_amount) - SUM(plan_amount)) / ABS(SUM(plan_amount)))::numeric, 4)::float8
  END AS variance_pct
FROM merged m
GROUP BY line_code
ORDER BY line_code
```

Do **both** Strategy 1 (pre-computed path, line 56) and Strategy 2 (on-the-fly, line 97) — both return per-asset rows that need aggregation.

---

## P1 — Header IRR Mislabel

**Symptom**: The header Performance KPI card says "Net IRR 12.4%" but 12.4% is actually the **gross** IRR.

**Root cause**: Line 344 of `page.tsx` uses `fundMetrics?.irr` from the `ReV2FundMetrics` type (line 3235 of `bos-api.ts`), which reads from `re_fund_quarter_metrics` — a table with a single ambiguous `irr` column. Meanwhile, the `fundState` object (type `ReV2FundQuarterState`, line 3077 of `bos-api.ts`) already has **both** `gross_irr` and `net_irr` from `re_fund_quarter_state` and is already loaded on the page (line 118 of `page.tsx`).

**File**: `src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx`, line 344

**Fix**: Replace the single IRR card with two cards using `fundState`:

```tsx
// Before (line 344):
<MetricCard label="Net IRR" value={fmtPercent(fundMetrics?.irr)} size="large" />

// After:
<MetricCard label="Gross IRR" value={fmtPercent(fundState?.gross_irr)} size="large" />
<MetricCard label="Net IRR" value={fmtPercent(fundState?.net_irr)} size="large" />
```

Also update the grid from `grid-cols-3` to `grid-cols-4` on the Performance section (line 341) to accommodate the extra card:

```tsx
<div className="grid grid-cols-4 gap-3">
  <MetricCard label="DPI" value={fmtMultiple(fundState?.dpi)} size="large" />
  <MetricCard label="TVPI" value={fmtMultiple(fundState?.tvpi)} size="large" />
  <MetricCard label="Gross IRR" value={fmtPercent(fundState?.gross_irr)} size="large" />
  <MetricCard label="Net IRR" value={fmtPercent(fundState?.net_irr)} size="large" />
</div>
```

---

## P2 — fmtMoney Precision Loss

**Symptom**: $5.1M and $4.6M both display as "$5M". Committed $5.1M vs Called $4.6M are indistinguishable.

**Root cause**: Line 80 of `page.tsx` uses `.toFixed(0)` for M-scale values.

**File**: `src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx`, line 80

**Fix**: Use 1 decimal for values under $100M:

```typescript
// Before:
if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;

// After:
if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
```

This gives "$5.1M" vs "$4.6M". If you want to be smarter, use `.toFixed(n >= 100_000_000 ? 0 : 1)` to avoid "$123.4M" for very large values.

---

## P3 — Raw Enum Strings in Variance Table

**Symptom**: Line items show `MGMT_FEE_PROP`, `OTHER_INCOME`, `ADMIN` instead of human-readable labels.

**Root cause**: `item.line_code` is rendered raw (line 913, 942, 958, 985 of `page.tsx`). No label mapping utility exists.

**Fix**: Add a label map at the top of `page.tsx` (or in a shared `lib/labels.ts`):

```typescript
const NOI_LINE_LABELS: Record<string, string> = {
  RENT: "Rental Income",
  OTHER_INCOME: "Other Income",
  VACANCY: "Vacancy & Credit Loss",
  EGI: "Effective Gross Income",
  MGMT_FEE_PROP: "Property Mgmt Fee",
  ADMIN: "Administrative",
  INSURANCE: "Insurance",
  TAXES: "Real Estate Taxes",
  UTILITIES: "Utilities",
  REPAIRS: "Repairs & Maintenance",
  NOI: "Net Operating Income",
};

function fmtLineCode(code: string): string {
  return NOI_LINE_LABELS[code] || code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
```

Then replace every `{item.line_code}` in the VarianceTab with `{fmtLineCode(item.line_code)}`.

---

## P4 — Waterfall Allocation All Zeros

**Symptom**: LP Summary table shows Return of Capital: $0, Preferred Return: $0, Carry: $0, Total: $0 for all partners.

**Root cause**: In `src/app/api/re/v2/funds/[fundId]/lp_summary/route.ts`, lines 117-150, the waterfall query reads `tier_code` from `re_waterfall_run_result` and maps them on lines 143-146:

```typescript
return_of_capital: wf.return_of_capital || "0",
preferred_return: wf.preferred_return || "0",
carry: wf.catch_up || wf.split || "0",
```

This assumes the `tier_code` column contains values like `"return_of_capital"`, `"preferred_return"`, `"catch_up"`, `"split"`. If the waterfall engine writes different codes (e.g., `"roc"`, `"pref"`, `"catchup"`, `"residual"`), all lookups return undefined → "0".

**Diagnosis step**: Run this SQL against the Supabase DB to see what tier codes actually exist:

```sql
SELECT DISTINCT tier_code FROM re_waterfall_run_result LIMIT 20;
```

Also check if any rows exist at all:

```sql
SELECT COUNT(*) FROM re_waterfall_run_result;
SELECT COUNT(*) FROM re_waterfall_run;
```

**Fix**: Once you know the actual tier codes, update the mapping on lines 143-146 of `lp_summary/route.ts` to match. For example, if the codes are `roc`, `pref`, `catchup`, `residual_split`:

```typescript
const allocation = wf ? {
  return_of_capital: wf.roc || wf.return_of_capital || "0",
  preferred_return: wf.pref || wf.preferred_return || "0",
  carry: wf.catchup || wf.catch_up || wf.residual_split || wf.split || "0",
  total: String(
    Object.values(wf).reduce((sum, v) => sum + parseFloat(v || "0"), 0)
  ),
} : undefined;
```

If no rows exist in `re_waterfall_run_result` at all, the waterfall run hasn't been executed for this fund/quarter. Check the quarter-close route (`src/app/api/re/v2/funds/[fundId]/quarter-close/route.ts`) to see if `run_waterfall` is being called, and seed data if needed.

---

## P5 — Fund NAV Showing "—" in Investment Table

**Symptom**: The Investments overview table shows "—" for the NAV column on every investment row.

**Root cause**: Line 530 of `page.tsx`:
```tsx
{rollup?.fund_nav_contribution ? fmtMoney(rollup.fund_nav_contribution) : "—"}
```

The field `fund_nav_contribution` is either not returned by the investments API or is null in the DB. The investment-level `nav` field (from `re_investment_quarter_state`) may be a better source.

**Diagnosis step**:
```sql
SELECT asset_id, nav, unrealized_value, gross_irr
FROM re_investment_quarter_state
WHERE fund_id = '<FUND_ID>' AND quarter = '2026Q1' AND scenario_id IS NULL;
```

**Fix**: In the investments API route (`src/app/api/re/v2/investments/route.ts`), ensure `nav` is returned in the response. Then in `page.tsx` line 530, fall back:

```tsx
{(rollup?.fund_nav_contribution || inv.nav) ? fmtMoney(rollup?.fund_nav_contribution || inv.nav) : "—"}
```

---

## Validation Checklist

After implementing all fixes, verify on the live site:

1. **Variance tab**: Each line code appears exactly ONCE (not duplicated per asset). Labels read "Rental Income", "Property Mgmt Fee", etc.
2. **Header KPIs**: Shows both "Gross IRR" and "Net IRR" as separate cards. Values differ (gross > net).
3. **Capital Activity cards**: "$5.1M" and "$4.6M" are distinguishable (not both "$5M").
4. **LP Summary waterfall**: At least some non-zero values in Return of Capital / Preferred Return columns.
5. **Investment table NAV**: Shows dollar values, not "—".
6. **Rollup totals**: Variance rollup total should equal sum of the (now-deduplicated) line items.

---

## File Index

| File | Changes |
|------|---------|
| `src/app/api/re/v2/variance/noi/route.ts` | P0: Aggregate by line_code in buildResponse |
| `src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx` | P1: IRR label fix, P2: fmtMoney precision, P3: line code labels |
| `src/app/api/re/v2/funds/[fundId]/lp_summary/route.ts` | P4: Waterfall tier_code mapping |
| `src/app/api/re/v2/investments/route.ts` | P5: Ensure NAV returned |

# Winston REPE Platform — Institutional UX Meta-Prompt for Claude Code

> Use this prompt as the **system context** when opening a new Claude Code session on the Winston repo.
> It captures the full architecture, design spec, and outstanding roadmap so Claude can pick up anywhere without ramp-up.

---

## 1. What Winston Is

Winston is an **institutional real estate private equity (REPE) platform** built for fund managers and LPs. It consists of:

- **`repo-b/`** — Next.js 14 App Router frontend + Next.js API routes (direct DB reads via `pg` pool). Deployed on Vercel.
- **`backend/`** — FastAPI Python backend ("BOS API"), the authoritative computation engine. Deployed on Railway.
- **Database** — Supabase PostgreSQL. Schema lives in `app.*` and `public.*` schemas.

### Key URL patterns

| Layer | Example |
|---|---|
| BOS API calls (via proxy) | `POST /bos/api/repe/v2/funds/{fundId}/quarter-close` |
| Direct DB API routes | `GET /api/re/v2/funds/{fundId}/lp_summary` |
| Fund detail page | `/lab/env/{envId}/re/funds/{fundId}` |

The BOS proxy lives at `repo-b/src/app/bos/[...path]/route.ts` and forwards to `BOS_API_ORIGIN`.

### Data fetch patterns
- `bosFetch()` → FastAPI on Railway. Used for computations (quarter close, waterfall runs, variance, covenants).
- Direct DB Next.js routes → `getPool()` in `src/lib/server/db.ts` reads `PG_POOLER_URL`. Used for LP summary, metrics-detail, fund state.

---

## 2. Core Data Model (what's in Supabase)

### Funds
- `repe_fund` — master fund record (`fund_id`, `business_id`, `name`, `strategy`, `vintage_year`, `target_size`)
- `re_fund_terms` — waterfall terms (`preferred_return_rate`, `carry_rate`, `waterfall_style`)
- `re_fund_quarter_state` — computed state per quarter (`portfolio_nav`, `total_committed`, `total_called`, `total_distributed`, `dpi`, `tvpi`, `gross_irr`, `net_irr`)
- `re_fund_metrics_qtr` — FI-computed metrics (`gross_irr`, `net_irr`, `gross_tvpi`, `net_tvpi`, `dpi`, `rvpi`, `cash_on_cash`, `created_at`)
- `re_gross_net_bridge_qtr` — bridge items (`gross_return`, `mgmt_fees`, `fund_expenses`, `carry_shadow`, `net_return`, `created_at`)

### Investments & Assets
- `re_investment` — investment within a fund
- `re_asset` — property-level asset linked to investment
- `re_investment_asset_link` — M:M join
- `re_investment_quarter_metrics` — per-investment NAV contribution, IRR, TVPI

### Partners & Capital
- `re_partner` — LP/GP entity
- `re_partner_commitment` — capital commitment per fund
- `re_partner_quarter_metrics` — per-LP per-quarter: contributed, distributed, NAV share, DPI, TVPI, IRR
- `re_waterfall_run` / `re_waterfall_run_result` — waterfall calculation results by tier

### Scenarios & Runs
- `re_scenario` — named scenario (`is_base` = true for base case)
- `re_run` — run log (`run_type` ∈ `{QUARTER_CLOSE, COVENANT_TEST, WATERFALL_SHADOW, WATERFALL_SCENARIO}`)
- `re_run_input` / `re_run_output` — provenance

### Financial Intelligence (FI)
- `re_fund_metrics_qtr` — gross/net IRR, TVPI, DPI, RVPI
- `re_gross_net_bridge_qtr` — gross→net decomposition
- `re_benchmark` — NCREIF ODCE benchmark data
- NOI variance, loan covenants, amortization schedules live in BOS API (FastAPI), not direct DB routes

---

## 3. Current Fund Detail Page Structure

**File:** `src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx`

### Tab order (post-redesign)
```
Overview | Performance | Asset Variance | [Debt Surveillance — debt funds only] | Scenarios | Waterfall Scenario | LP Summary | Run Center
```

### Tab → Component mapping
| Tab | Component | Data source |
|---|---|---|
| Overview | `OverviewTab` | `listReV2Investments`, `getReV2FundInvestmentRollup`, `getFundValuationRollup` (BOS) |
| Performance | `ReturnsTab` | `getFiFundMetrics` → `/api/re/v2/funds/{id}/metrics-detail` (direct DB) |
| Asset Variance | `VarianceTab` | `getFiNOIVariance` (BOS) |
| Debt Surveillance | `DebtSurveillanceTab` | `getFiLoans`, `getFiCovenantResults`, `getFiWatchlist` (BOS) |
| Scenarios | `ScenariosTab` + `SaleScenarioPanel` | `listReV2Scenarios`, `createReV2Scenario` (BOS) |
| Waterfall Scenario | `WaterfallScenarioPanel` | BOS waterfall scenario runs |
| LP Summary | `LpSummaryTab` | `getLpSummary` → `/api/re/v2/funds/{id}/lp_summary` (direct DB) |
| Run Center | `RunCenterTab` | `runReV2QuarterClose`, `runReV2Waterfall`, `runFiCovenantTests`, `listReV2Runs` (BOS) |

### KPI strip structure (post-redesign)
Two labeled panels side-by-side:
- **Capital Activity**: Committed, Called, Distributed, NAV
- **Performance**: DPI, TVPI, Net IRR

### Header structure (post-redesign)
1. Title row: fund name + Export dropdown (top-right)
2. Secondary info bar: strategy · vintage · target size + `[🔗 Lineage]` `[🌿 Sustainability]` icon chips
3. Fund terms strip (if terms exist): Pref Return, Carry, Waterfall style

---

## 4. Design System

Classes use a custom Tailwind config with tokens:
- `bm-accent` — primary action color (blue)
- `bm-surface` — card/panel background
- `bm-border` — border color
- `bm-muted` / `bm-muted2` — secondary text
- `bm-text` — primary text
- `font-display` — heading font

Metric values: `font-semibold` (weight 600). Large numbers: no trailing decimal (`$425M` not `$425.0M`). Use `fmtMoney()`, `fmtMultiple()`, `fmtPercent()` helpers defined at top of `page.tsx`.

Card sizes: `size="large"` for primary KPIs, `size="compact"` for secondary. `MetricCard` is at `src/components/ui/MetricCard.tsx`.

---

## 5. Outstanding UX Work (Prioritized Roadmap)

### 5a. Overview Tab — Priority: HIGH

**Goal:** Replace the raw investment table with a dashboard that gives a fund manager a 30-second read on portfolio health.

**Layout spec:**
```
┌─────────────────────────────────────────────┐
│  FUND VALUE CHART (NAV over time, sparkline) │
├──────────────────┬──────────────────────────┤
│  TOP PERFORMERS  │  CAPITAL ACTIVITY         │
│  (top 3 assets   │  TIMELINE                 │
│  by IRR contrib) │  (called vs distributed)  │
├──────────────────┴──────────────────────────┤
│  INVESTMENT TABLE (existing, keep)           │
└─────────────────────────────────────────────┘
```

**Contribution to Fund IRR panel** (inside Overview or Performance tab):
- Show each investment's contribution to fund-level IRR as a horizontal bar chart
- Data: `re_investment_quarter_metrics.irr_contribution` (add this column if missing)
- Sort descending by contribution
- Color: green if positive, red if negative

**"Last Close" metadata**: Show in the header secondary bar: `Last Close: 2026Q1` (from `re_run` table, most recent `QUARTER_CLOSE` run)

### 5b. Performance Tab — Priority: HIGH

**Current state:** Returns `ReturnsTab` with gross/net KPIs, gross→net bridge, benchmark comparison. Working post-Section E fix.

**Enhancements:**
- Add IRR timeline chart (quarterly net IRR over time, from `re_fund_quarter_state`)
- Add gross vs net side-by-side column chart
- The `gross-net-spread` metric card should say `"G→N Spread"` not `"Spread"` and show in basis points with a tooltip explaining it's gross_irr − net_irr

### 5c. Asset Variance Tab — Priority: MEDIUM

**Current state:** `VarianceTab` shows NOI line items vs budget.

**Enhancements:**
- Add stacked bar chart: Actual vs Budget vs Pro Forma by asset/investment
- Add a "Variance Drivers" summary: top 3 over-budget and top 3 under-budget line items
- If no budget baseline exists, show guided empty state: "Upload a budget baseline in UW Versions to see variance" with link to UW versions

### 5d. Scenarios Tab — Priority: MEDIUM

**Current state:** `ScenariosTab` with scenario selector and `SaleScenarioPanel`.

**Enhancements (Model/Scenario architecture):**

The mental model: a **Model** is a set of operating assumptions (cap rates, rent growth, hold period). A **Scenario** is "run the waterfall with this model." The UI should reflect this:

```
┌── Model Workspace ─────────────────────────────────────────────┐
│  Model:  [Base Case ▾]   Quarter: [2026Q1 ▾]                   │
│                                                                 │
│  Asset-by-asset assumption grid:                               │
│  ┌────────────┬──────────┬──────────┬──────────┬─────────────┐ │
│  │ Investment │ Cap Rate │ Rent Grw │ Hold Yrs │ Exit Value  │ │
│  ├────────────┼──────────┼──────────┼──────────┼─────────────┤ │
│  │ Prop A     │  5.50%   │  3.0%    │    5     │   $120M     │ │
│  │ Prop B     │  6.00%   │  2.5%    │    7     │    $85M     │ │
│  └────────────┴──────────┴──────────┴──────────┴─────────────┘ │
│                                                                 │
│  ┌── Sticky footer ──────────────────────────────────────────┐  │
│  │  [💾 Save Model]  [▶ Run Scenario]  [+ New Model]        │  │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Ripple effects panel** (right sidebar or below grid):
When any assumption changes, show projected impact on: NAV, IRR, DPI, TVPI, Carry. These should update in near-real-time as user edits (debounced 500ms).

### 5e. LP Summary Tab — Priority: LOW (working, polish only)

- Add per-LP IRR column (from `re_partner_quarter_metrics.irr`)
- Add export button: "Download LP Report (PDF)" that generates a per-LP statement
- Sort partners: GP first, then LPs alphabetically

### 5f. Waterfall Scenario Tab — Priority: LOW (working)

- Add "Waterfall Timeline" chart: tier fills over time (quarters on x-axis, cumulative tier balances on y-axis)
- The `WaterfallTierTable` component already renders tier breakdown — just add the chart

### 5g. Run Center Tab — Priority: LOW (working)

- Add a "Schedule" button: allow scheduling a recurring quarter close (weekly, monthly)
- Show run duration in the run history table

---

## 6. Backend Endpoints to Build (FastAPI)

These are called for, but either missing or incomplete:

| Endpoint | Purpose |
|---|---|
| `GET /api/repe/v2/funds/{fundId}/irr-timeline` | Quarterly net IRR, gross IRR from `re_fund_quarter_state` |
| `GET /api/repe/v2/funds/{fundId}/capital-timeline` | Quarterly called/distributed from `re_partner_quarter_metrics` |
| `GET /api/repe/v2/funds/{fundId}/irr-contribution` | Per-investment IRR contribution for the waterfall |
| `POST /api/repe/v2/funds/{fundId}/model-preview` | Given hypothetical assumptions, return projected IRR/NAV/DPI (used for scenario ripple effects) |

---

## 7. Key Infrastructure Notes

### Migrations
All schema changes go through the Supabase MCP tool (`apply_migration`). The project ID is `ozboonlsplroialdwuxj`.

Critical past migrations already applied:
- `add_created_at_to_metrics_and_bridge_tables` — adds `created_at` to `re_fund_metrics_qtr` and `re_gross_net_bridge_qtr`
- `create_public_env_business_bindings_view` — exposes `app.env_business_bindings` in `public` schema
- `fix_re_run_run_type_check_add_waterfall_scenario` — adds `WATERFALL_SCENARIO` to `re_run.run_type` check constraint

### Environment variables (Vercel)
- `PG_POOLER_URL` — Supabase pooler URL (required for all direct DB routes)
- `BOS_API_ORIGIN` — Railway FastAPI URL (required for BOS proxy)
- `NEXT_PUBLIC_BOS_API_BASE_URL` — fallback for BOS origin

### Deployment flow
1. Make code changes in `repo-b/`
2. `git commit && git push origin main` from the repo
3. Vercel auto-deploys from `main`
4. Test at `https://prj_0wG8qDaXVJ5C5y2tKeIYsXqG9iLH.vercel.app` (use Vercel MCP to get latest deploy URL)

---

## 8. Testing Checklist (E2E)

After any deploy, run this sequence manually against the live Vercel URL:

1. **Fund loads**: Navigate to fund page → header shows fund name, KPI panels populate
2. **Performance tab**: Click "Performance" → KPI cards show gross/net IRR, TVPI, DPI. Gross→Net bridge visible.
3. **Asset Variance tab**: Click "Asset Variance" → NOI line items table visible
4. **Scenarios tab**: Click "Scenarios" → scenario selector + SaleScenarioPanel visible
5. **Waterfall Scenario tab**: Click "Waterfall Scenario" → click "Run Scenario Waterfall" → comparison table shows Base vs Scenario
6. **LP Summary tab**: Click "LP Summary" → partner table with 4+ rows
7. **Run Center**: Click "Run Center" → click "Run Quarter Close" → toast shows success, run history updates
8. **Empty state CTA**: If Performance tab shows empty state, "[Run Quarter Close]" button navigates to Run Center tab
9. **Export dropdown**: Click "Export ▾" → dropdown shows Export Excel, LP Report, Waterfall options

---

## 9. File Map (Key Files)

```
repo-b/
├── src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx   ← MAIN FILE (all tabs)
├── src/app/api/re/v2/funds/[fundId]/
│   ├── lp_summary/route.ts       ← direct DB: LP partner data
│   ├── metrics-detail/route.ts   ← direct DB: gross/net IRR, bridge
│   └── quarter-state/route.ts    ← direct DB: NAV, committed, called
├── src/app/bos/[...path]/route.ts ← BOS proxy to FastAPI
├── src/lib/bos-api.ts             ← all client-side fetch functions
├── src/lib/server/db.ts           ← getPool(), resolveBusinessId()
├── src/components/repe/
│   ├── WaterfallScenarioPanel.tsx
│   ├── SaleScenarioPanel.tsx
│   ├── LPBreakdown.tsx
│   ├── WaterfallTierTable.tsx
│   └── ExcelExportButton.tsx
└── src/components/ui/MetricCard.tsx

backend/
└── app/routes/re_financial_intelligence.py  ← NOI variance, metrics, loans, covenants
```

---

## 10. Quick Start for Claude Code

```
You are working on Winston, an institutional REPE platform.
Read WINSTON_REPE_META_PROMPT.md at the root of the Consulting_app repo first.
The main fund detail page is at repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx.
All design decisions follow Section 4 (design system) and Section 5 (UX roadmap).
Run `npx tsc --noEmit` in repo-b/ to verify TypeScript after any changes.
Never break the TABS constant or tab content switch-matching — they must stay in sync.
```

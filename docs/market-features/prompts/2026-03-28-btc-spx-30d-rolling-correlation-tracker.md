# FEATURE: BTC-SPX 30-Day Rolling Correlation Tracker

> **Refreshed:** 2026-03-28 by fin-feature-builder | Spec stable since 2026-03-26. Build-ready. Day 6 at spec_ready — recommend build start.

**Origin:** cr-regime-btc rotation on 2026-03-22
**Gap Category:** calculation
**Priority Score:** 88.60 | **Cross-Vertical:** Yes
**Card ID:** 45901608-96ab-4a20-813d-ec1f65a3314f
**Build Order:** 3 of 3 (independent data pipeline, but feeds crypto signal into Regime Classifier)

## Context

### Why This Exists
During the March 22 cr-regime-btc rotation, the regime report flagged the BTC-SPX 30-day correlation rebound from -0.50 to +0.13 as a confirming secondary risk-off signal. This correlation dynamic is a key structural indicator — when BTC recouples with equities, it signals macro risk contagion rather than idiosyncratic crypto moves.

### What Couldn't Be Done
Winston could not compute or surface the rolling 30-day Pearson correlation between BTC and SPX returns. No chart, no alert for zero-crossing events (decoupling/recoupling), no way to answer "is BTC acting as a macro asset right now?"

### Segment Intelligence Brief Reference
`docs/market-intelligence/2026-03-22-cr-regime-btc.md`

---

## Specification

### What It Does
Computes daily 30-day rolling Pearson correlation between BTC-USD and S&P 500 daily log returns. Stores the full timeseries. Detects zero-crossing events (correlation flipping sign = decoupling/recoupling regime shift). Feeds the correlation value as a crypto signal into the Multi-Asset Regime Classifier. Surfaces an interactive line chart with zero-crossing event markers and a current-value badge.

### Data Layer

**New Tables (additive only):**
```sql
CREATE TABLE public.btc_spx_correlation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  calc_date DATE NOT NULL,
  correlation_30d NUMERIC(6,4) NOT NULL,   -- -1.0000 to +1.0000
  btc_return_30d NUMERIC(8,5),
  spx_return_30d NUMERIC(8,5),
  zero_crossing BOOLEAN NOT NULL DEFAULT false,
  crossing_direction TEXT,                  -- 'decouple' (pos->neg) or 'recouple' (neg->pos)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, calc_date)
);

ALTER TABLE public.btc_spx_correlation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.btc_spx_correlation
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX idx_btc_spx_corr_date ON public.btc_spx_correlation(tenant_id, calc_date DESC);
```

**Data Sources:**
- `fact_market_timeseries` (internal) — BTC-USD daily close, ^GSPC daily close
- No external API required (data already ingested via market data pipeline)

**Data Pipeline:**
`fact_market_timeseries` (BTC-USD, ^GSPC) → `btc_spx_correlation_service.compute_correlation()` daily → log return computation → 30-day rolling Pearson → zero-crossing detection → INSERT into `btc_spx_correlation` → consumed by Regime Classifier + API

---

### Backend

**New Service File(s):**
- `backend/app/services/btc_spx_correlation_service.py`
  - `compute_correlation(tenant_id: UUID, calc_date: date) -> CorrelationRecord` — Fetches 31 days of BTC-USD and SPX closes from fact_market_timeseries, computes daily log returns, calculates 30-day Pearson correlation, detects zero-crossing vs previous day, inserts record
  - `get_latest_correlation(tenant_id: UUID) -> CorrelationRecord` — Returns most recent correlation value
  - `get_correlation_history(tenant_id: UUID, start_date: date, end_date: date) -> list[CorrelationRecord]` — Returns date range for charting
  - `get_zero_crossings(tenant_id: UUID, limit: int) -> list[CorrelationRecord]` — Returns recent zero-crossing events

**New Route(s):**
- `GET /api/v1/market/correlation/btc-spx`
  - Request: query params `start_date` (date), `end_date` (date, default today), `limit` (int, default 180)
  - Response: `{ correlations: CorrelationRecord[], count: int, zero_crossings: CorrelationRecord[] }`
- `GET /api/v1/market/correlation/btc-spx/latest`
  - Request: none
  - Response: `{ correlation: { calc_date, correlation_30d, zero_crossing, crossing_direction, btc_return_30d, spx_return_30d } }`

**Dependencies:**
- `numpy` for Pearson correlation computation
- No additional env vars required

---

### Frontend

**New Component:**
- Name: `BtcSpxCorrelationChart`
  - Location: `repo-b/src/components/market/BtcSpxCorrelationChart.tsx`
  - Props: `{ history: CorrelationRecord[], latest?: CorrelationRecord, loading: boolean }`
  - Displays: Line chart of 30-day rolling correlation over time, zero line reference, event markers at zero-crossings (green = decouple, orange = recouple), current value badge with direction indicator

**Visualization:**
- Chart type: Line chart with reference line at y=0 and event markers
- Library: recharts
- Interaction: hover shows date's correlation value + BTC/SPX 30-day returns, click on zero-crossing marker shows regime implication tooltip

**Integration Point:**
- Where in existing UI: Market Intelligence dashboard → Crypto sub-section
- Navigation: Dashboard → Market Intelligence tab → Crypto section → BTC-SPX Correlation chart
- Also available as a mini-widget in the Regime Classifier detail view

---

### Cross-Vertical Hooks

- **→ Regime Classifier:** `correlation_30d` value feeds directly into the crypto sub-score of the Multi-Asset Regime Classifier. Zero-crossing events contribute to regime transition detection.
- **→ Credit:** Crypto correlation state informs credit advisories for crypto-collateralized loans — when BTC recouples with equities (positive correlation), collateral risk increases during equity drawdowns.
- **→ REPE:** Indirect — crypto correlation regime informs broad macro risk assessment visible in REPE underwriting context.

---

## Verification

1. **Correlation computation test:** Seed `fact_market_timeseries` with 31 days of known BTC-USD and SPX prices where the true 30-day Pearson correlation is ~0.80. Run `compute_correlation()`. Verify: `correlation_30d` is within 0.01 of expected value, `zero_crossing = false`.
2. **Zero-crossing detection test:** Seed two consecutive days where correlation flips from -0.05 to +0.03. Run compute for the second day. Verify: `zero_crossing = true`, `crossing_direction = 'recouple'`.
3. **API + chart integration test:** Seed 180 days of correlation data including 3 zero-crossing events. Call `GET /api/v1/market/correlation/btc-spx?limit=180`. Verify: response returns 180 records, `zero_crossings` array contains exactly 3 events, chart renders with visible event markers at correct dates.

---

## Proof of Execution Requirements

1. Code compiles / service starts without errors
2. All 3 verification tests pass
3. Route responds with correct shape
4. Smoke test: end-to-end flow from fact_market_timeseries seed → correlation compute → record insert → API response → chart render
5. No regressions: existing tests still pass

---

## Repo Safety Contract

```
PROTECTED — DO NOT MODIFY:
- Existing REPE calculation engines (DCF, waterfall, IRR)
- Existing credit decisioning services (credit.py, credit_decisioning.py)
- Existing PDS dashboard services
- Supabase RLS policies on all existing tables
- Any table in schemas 274, 275, 277 (credit core, object model, workflow)
- Meridian demo environment assets and seed data

ADDITIVE ONLY:
- New tables must be CREATE TABLE, never ALTER existing tables
- New services must be new files, never overwrite existing service files
- New routes must be new files or additive endpoints in existing route files
- Frontend: new components, never modify existing component logic
```

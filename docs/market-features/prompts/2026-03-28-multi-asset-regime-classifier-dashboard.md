# FEATURE: Multi-Asset Regime Classifier Dashboard

> **Refreshed:** 2026-03-28 by fin-feature-builder | Spec stable since 2026-03-26. Build-ready. Day 6 at spec_ready — recommend build start.

**Origin:** ma-regime-classifier rotation on 2026-03-22
**Gap Category:** risk_model
**Priority Score:** 92.00 | **Cross-Vertical:** Yes
**Card ID:** c61eb780-f91d-462b-b2ad-fd0fcbba2c2a
**Build Order:** 1 of 3 (foundational — creates `market_regime_snapshot` consumed by Sentinel and Correlation Tracker)

## Context

### Why This Exists
During macro research rotations, Winston surfaces isolated signals (VIX, yield spreads, crypto momentum, etc.) with no unified layer synthesizing them into a single regime state. Analysts must mentally reconcile 4-6 separate signal streams to answer "what is the current market regime?"

### What Couldn't Be Done
Winston could not produce a composite regime label (Risk-On / Risk-Off / Transitional / Stress) from multiple asset classes in a single query. No composite confidence score, no per-asset-class breakdown, no regime history tracking.

### Segment Intelligence Brief Reference
`docs/market-intelligence/2026-03-22-ma-regime-classifier.md`

---

## Specification

### What It Does
Computes a daily composite multi-asset regime label and confidence score by synthesizing signals from equities (VIX, SPX momentum), rates (2s10s spread, Fed Funds), credit (HY OAS, IG OAS), and crypto (BTC momentum, BTC-SPX correlation). Stores daily snapshots and surfaces a dashboard widget showing current regime, confidence, per-asset breakdown, and 90-day history chart.

### Data Layer

**New Tables (additive only):**
```sql
CREATE TABLE public.market_regime_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  run_date DATE NOT NULL,
  label TEXT NOT NULL,                  -- 'risk_on', 'risk_off', 'transitional', 'stress'
  confidence NUMERIC(5,4) NOT NULL,     -- 0.0000 to 1.0000
  composite_score NUMERIC(6,3) NOT NULL,
  equities_score NUMERIC(6,3),
  rates_score NUMERIC(6,3),
  credit_score NUMERIC(6,3),
  crypto_score NUMERIC(6,3),
  signals_json JSONB NOT NULL DEFAULT '{}',  -- raw signal values used in computation
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, run_date)
);

ALTER TABLE public.market_regime_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.market_regime_snapshot
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX idx_regime_snapshot_date ON public.market_regime_snapshot(tenant_id, run_date DESC);
```

**Data Sources:**
- `fact_market_timeseries` (internal) — SPX, VIX, yield curve, HY OAS, IG OAS, BTC-USD
- FRED API (`VIXCLS`, `T10Y2Y`, `BAMLH0A0HYM2`, `BAMLC0A0CM`) — daily refresh
- `btc_spx_correlation` table (from BTC-SPX Correlation Tracker card) — daily

**Data Pipeline:**
Source (fact_market_timeseries + FRED) → `market_regime_engine.compute_regime()` daily at market close → per-asset-class scoring → weighted composite → label classification → INSERT into `market_regime_snapshot` → available via API

---

### Backend

**New Service File(s):**
- `backend/app/services/market_regime_engine.py`
  - `compute_regime(tenant_id: UUID, run_date: date) -> RegimeSnapshot` — Fetches all signal inputs, computes per-asset scores using z-score normalization against trailing 252-day windows, applies configurable weights, classifies into regime label based on composite thresholds, inserts snapshot
  - `get_latest_regime(tenant_id: UUID) -> RegimeSnapshot` — Returns most recent snapshot
  - `get_regime_history(tenant_id: UUID, start_date: date, end_date: date) -> list[RegimeSnapshot]` — Returns date-range of snapshots for charting

**New Route(s):**
- `GET /api/v1/market/regime/latest`
  - Request: none
  - Response: `{ snapshot: { label, confidence, composite_score, equities_score, rates_score, credit_score, crypto_score, signals_json, run_date } }`
- `GET /api/v1/market/regime/history`
  - Request: query params `start_date` (date), `end_date` (date, default today), `limit` (int, default 90)
  - Response: `{ snapshots: RegimeSnapshot[], count: int }`

**Dependencies:**
- `numpy` for z-score computation and statistical functions
- `httpx` (already in project) for FRED API
- Env var: `FRED_API_KEY`

---

### Frontend

**New Component:**
- Name: `RegimeClassifierWidget`
  - Location: `repo-b/src/components/market/RegimeClassifierWidget.tsx`
  - Props: `{ snapshot?: RegimeSnapshot, history?: RegimeSnapshot[], loading: boolean }`
  - Displays: Current regime label badge (color-coded), confidence meter, 4-quadrant asset class breakdown (equities/rates/credit/crypto), 90-day regime history area chart

**Visualization:**
- Chart type: Area chart (regime history) + gauge (confidence) + quad grid (per-asset scores)
- Library: recharts
- Interaction: hover on history chart shows date's regime detail, click on asset quadrant shows contributing signals

**Integration Point:**
- Where in existing UI: Market Intelligence dashboard, primary widget position (top-left)
- Navigation: Dashboard → Market Intelligence tab → Regime Classifier widget

---

### Cross-Vertical Hooks

- **→ REPE:** Exposes `get_latest_regime()` for underwriting context enrichment — cap rate assumptions can reference current regime label and confidence
- **→ Credit:** Feeds regime state into credit tightening advisories — Risk-Off and Stress labels trigger review recommendations for DTI thresholds
- **→ PDS:** Provides market conditions context for project financing dashboards — regime label displayed in PDS executive summary

---

## Verification

1. **Regime computation test:** Seed `fact_market_timeseries` with known historical values for a Risk-Off period (e.g., March 2020). Run `compute_regime()`. Verify: label = `risk_off`, confidence > 0.7, credit_score negative, equities_score negative.
2. **API response shape test:** Call `GET /api/v1/market/regime/latest`. Verify: response contains all expected fields (label, confidence, all 4 per-asset scores, signals_json), types are correct, label is one of the 4 valid enum values.
3. **History chart data test:** Seed 90 days of snapshots. Call `GET /api/v1/market/regime/history?limit=90`. Verify: returns 90 records in descending date order, all fields populated, chart renders without errors.

---

## Proof of Execution Requirements

1. Code compiles / service starts without errors
2. All 3 verification tests pass
3. Route responds with correct shape
4. Smoke test: end-to-end flow from fact_market_timeseries seed → compute_regime() → snapshot insert → API response → widget render
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

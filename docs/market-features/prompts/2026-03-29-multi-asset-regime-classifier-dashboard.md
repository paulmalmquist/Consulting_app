# FEATURE: Multi-Asset Regime Classifier Dashboard

**Origin:** ma-regime-classifier rotation on 2026-03-22
**Gap Category:** risk_model
**Priority Score:** 92.00 | **Cross-Vertical:** Yes
**Card ID:** c61eb780-f91d-462b-b2ad-fd0fcbba2c2a

## Context

### Why This Exists
The ma-regime-classifier research rotation on 2026-03-22 revealed that Winston has no unified regime state visible to analysts. Macro signals from equities, rates, credit, and crypto exist in separate modules, forcing analysts to mentally synthesize regime context across disconnected screens.

### What Couldn't Be Done
No single view or service could classify the current market regime (Risk-On / Risk-Off / Transitional / Stress) with a composite confidence score across all asset classes. Analysts had no way to see regime state without manually checking multiple data sources.

### Segment Intelligence Brief Reference
docs/market-intelligence/2026-03-22-ma-regime-classifier.md

---

## Specification

### What It Does
Provides a daily composite multi-asset regime classifier that synthesizes equities, rates, credit, and crypto signals into a single regime label (Risk-On / Risk-Off / Transitional / Stress) with a confidence score and per-asset-class breakdown. Analysts see regime state at a glance; downstream modules consume the classification for contextual decision-making.

### Data Layer

**New Tables (additive only):**
```sql
CREATE TABLE market_regime_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id TEXT NOT NULL,
  business_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  regime_label TEXT NOT NULL CHECK (regime_label IN ('RISK_ON', 'RISK_OFF', 'TRANSITIONAL', 'STRESS')),
  confidence_score NUMERIC(5,4) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  equities_z NUMERIC(8,4),
  rates_z NUMERIC(8,4),
  credit_z NUMERIC(8,4),
  crypto_z NUMERIC(8,4),
  composite_z NUMERIC(8,4),
  signal_details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE market_regime_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON market_regime_snapshot
  USING (env_id = current_setting('app.env_id', true));

CREATE INDEX idx_regime_snapshot_date ON market_regime_snapshot(env_id, snapshot_date DESC);

COMMENT ON TABLE market_regime_snapshot IS 'Daily composite regime classification across equities, rates, credit, and crypto. Owned by market_rotation_engine module.';
```

**Data Sources:**
- FRED API (VIX, 10Y yield, HY OAS, DXY) -- daily refresh
- CoinGecko or equivalent (BTC-USD) -- daily refresh
- Yahoo Finance or equivalent (SPX close) -- daily refresh

**Data Pipeline:**
Source APIs (daily close) -> Z-score normalization per signal -> Composite score calculation (weighted average) -> Regime label assignment via threshold bands -> Insert into market_regime_snapshot -> Available via API routes

---

### Backend

**New Service File(s):**
- `backend/app/services/market_regime_engine.py`
  - `fetch_macro_signals(date: date) -> dict` -- Pulls latest values from FRED, crypto, equity APIs
  - `compute_z_scores(signals: dict, lookback: int = 90) -> dict` -- Z-score normalization against 90-day rolling window
  - `classify_regime(z_scores: dict) -> tuple[str, float]` -- Returns (regime_label, confidence_score) based on composite thresholds
  - `run_daily_snapshot(env_id: str, business_id: str) -> MarketRegimeSnapshot` -- Orchestrates full pipeline and persists result

**New Route(s):**
- `GET /api/v1/market/regime/latest`
  - Request: query params `env_id`
  - Response: `{ regime_label, confidence_score, equities_z, rates_z, credit_z, crypto_z, composite_z, snapshot_date, signal_details }`

- `GET /api/v1/market/regime/history`
  - Request: query params `env_id, start_date, end_date`
  - Response: `{ snapshots: [MarketRegimeSnapshot[]] }`

**Dependencies:**
- `httpx` (async HTTP for API calls)
- `numpy` (z-score calculations)
- `FRED_API_KEY` env var

---

### Frontend

**New Component:**
- Name: `RegimeClassifierWidget`
- Location: `repo-b/src/components/market/RegimeClassifierWidget.tsx`
- Props: `{ envId: string }`

**Visualization:**
- Chart type: Composite area chart (regime history over time) + gauge (current confidence) + quad grid (per-asset-class z-scores)
- Library: recharts
- Interaction: Hover shows daily detail; click on date drills to signal breakdown

**Integration Point:**
- Where in existing UI: Market Intelligence dashboard tab, top-of-page widget
- Navigation: Market Intelligence -> Regime Overview (new tab or top section)

---

### Cross-Vertical Hooks

- **-> REPE:** Regime label feeds into acquisition underwriting context -- Risk-Off/Stress regimes trigger conservative cap rate assumptions
- **-> Credit:** Regime state informs credit tightening assumptions in DTI and LTV models
- **-> PDS:** Market conditions section of PDS dashboards can display current regime as environmental context

---

## Verification

1. **Daily snapshot generation:** Call `run_daily_snapshot()` with test env_id; verify a row is inserted into `market_regime_snapshot` with all z-scores populated and a valid regime label
2. **API response shape:** GET `/api/v1/market/regime/latest` returns JSON with all required fields; regime_label is one of the 4 valid values; confidence_score is between 0 and 1
3. **History range query:** GET `/api/v1/market/regime/history?start_date=2026-03-01&end_date=2026-03-29` returns an array of snapshots sorted by date descending, each with valid schema

---

## Proof of Execution Requirements

1. Code compiles / service starts without errors
2. All 3 verification tests pass
3. Route responds with correct shape
4. Smoke test: end-to-end flow from FRED API -> z-score calculation -> regime classification -> DB insert -> API response -> frontend render
5. No regressions: existing tests still pass

---

## Repo Safety Contract

```
PROTECTED -- DO NOT MODIFY:
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

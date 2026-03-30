# FEATURE: BTC-SPX 30-Day Rolling Correlation Tracker

**Origin:** cr-regime-btc rotation on 2026-03-22
**Gap Category:** calculation
**Priority Score:** 88.60 | **Cross-Vertical:** Yes
**Card ID:** 45901608-96ab-4a20-813d-ec1f65a3314f

## Context

### Why This Exists
The cr-regime-btc research rotation on 2026-03-22 flagged a BTC-SPX correlation rebound from -0.50 to +0.13 as a confirming risk-off signal. This structural correlation regime shift had no surface in Winston, meaning analysts had no way to monitor whether crypto was decoupling from or recoupling with traditional equities.

### What Couldn't Be Done
Winston had no mechanism to track or visualize the rolling correlation between Bitcoin and S&P 500 returns. Zero-crossing events (decoupling/recoupling) went undetected, and the crypto signal could not feed into the broader regime classification framework.

### Segment Intelligence Brief Reference
docs/market-intelligence/2026-03-22-cr-regime-btc.md

---

## Specification

### What It Does
Computes and persists the daily 30-day rolling Pearson correlation between BTC-USD and SPX log returns. Detects zero-crossing events (when correlation crosses from negative to positive or vice versa) and marks them as decouple/recouple events. Provides a historical chart with event markers and feeds the correlation value as a signal into the Regime Classifier.

### Data Layer

**New Tables (additive only):**
```sql
CREATE TABLE btc_spx_correlation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id TEXT NOT NULL,
  business_id UUID NOT NULL,
  calc_date DATE NOT NULL,
  correlation_30d NUMERIC(8,6) NOT NULL,
  btc_return_30d NUMERIC(10,6),
  spx_return_30d NUMERIC(10,6),
  zero_crossing BOOLEAN DEFAULT false,
  crossing_direction TEXT CHECK (crossing_direction IN ('DECOUPLE', 'RECOUPLE', NULL)),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(env_id, calc_date)
);

ALTER TABLE btc_spx_correlation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON btc_spx_correlation
  USING (env_id = current_setting('app.env_id', true));

CREATE INDEX idx_btc_spx_corr_date ON btc_spx_correlation(env_id, calc_date DESC);
CREATE INDEX idx_btc_spx_crossings ON btc_spx_correlation(env_id, zero_crossing) WHERE zero_crossing = true;

COMMENT ON TABLE btc_spx_correlation IS '30-day rolling Pearson correlation between BTC-USD and SPX log returns with zero-crossing event detection. Owned by market_rotation_engine module.';
```

**Data Sources:**
- CoinGecko or equivalent (BTC-USD daily close) -- daily refresh
- Yahoo Finance or equivalent (SPX daily close) -- daily refresh
- Historical backfill: at least 90 days of daily closes for both assets

**Data Pipeline:**
Daily close prices (BTC-USD, SPX) -> Compute log returns -> 30-day rolling Pearson correlation -> Zero-crossing detection vs. previous day -> Insert into btc_spx_correlation -> Feed correlation value to Regime Classifier as crypto_z input

---

### Backend

**New Service File(s):**
- `backend/app/services/btc_spx_correlation_service.py`
  - `fetch_daily_prices(asset: str, lookback_days: int = 60) -> list[dict]` -- Fetches daily close prices for BTC-USD or SPX
  - `compute_log_returns(prices: list[float]) -> list[float]` -- Converts price series to log returns
  - `compute_rolling_correlation(btc_returns: list[float], spx_returns: list[float], window: int = 30) -> float` -- 30-day rolling Pearson correlation
  - `detect_zero_crossing(current: float, previous: float) -> tuple[bool, str | None]` -- Returns (is_crossing, direction) where direction is DECOUPLE (pos->neg) or RECOUPLE (neg->pos)
  - `run_daily_calculation(env_id: str, business_id: str) -> BtcSpxCorrelation` -- Orchestrates full pipeline and persists result

**New Route(s):**
- `GET /api/v1/market/correlation/btc-spx`
  - Request: query params `env_id, start_date, end_date`
  - Response: `{ correlations: BtcSpxCorrelation[], zero_crossings: [{ date, direction }] }`

- `GET /api/v1/market/correlation/btc-spx/latest`
  - Request: query params `env_id`
  - Response: `{ correlation_30d, calc_date, btc_return_30d, spx_return_30d, zero_crossing, crossing_direction }`

**Dependencies:**
- `httpx` (async HTTP for price API calls)
- `numpy` (log returns and Pearson correlation)
- No additional env vars required (public price APIs)

---

### Frontend

**New Component:**
- Name: `BtcSpxCorrelationChart`
- Location: `repo-b/src/components/market/BtcSpxCorrelationChart.tsx`
- Props: `{ envId: string, dateRange?: { start: string, end: string } }`

**Visualization:**
- Chart type: Line chart with zero-line reference, event markers at zero-crossing points
- Library: recharts
- Interaction: Hover shows daily correlation value and both asset returns; click on crossing event shows detail tooltip (DECOUPLE/RECOUPLE with date and before/after values)
- Color coding: positive correlation = blue, negative correlation = red, zero-line = gray dashed

**Integration Point:**
- Where in existing UI: Market Intelligence dashboard, below Regime Classifier widget (or as a tab peer)
- Navigation: Market Intelligence -> Crypto Correlation tab or section

---

### Cross-Vertical Hooks

- **-> REPE:** Correlation regime shift (sustained decoupling) may indicate divergent macro conditions relevant to REPE portfolio diversification analysis
- **-> Credit:** Crypto-collateralized loan risk assessment -- when BTC-SPX correlation is high and regime is STRESS, crypto collateral values are likely to fall in tandem with equities, increasing loan risk
- **-> Regime Classifier:** Feeds crypto_z signal into the composite regime calculation as a confirming/diverging indicator

---

## Verification

1. **Daily calculation accuracy:** Provide 60 days of known BTC and SPX prices; call `run_daily_calculation()`; verify the resulting correlation_30d matches an independently calculated Pearson correlation within 0.001 tolerance
2. **Zero-crossing detection:** Insert a row with correlation_30d = -0.05; run calculation that produces correlation_30d = +0.10; verify zero_crossing = true and crossing_direction = 'RECOUPLE'
3. **API response shape:** GET `/api/v1/market/correlation/btc-spx/latest` returns JSON with all required fields; correlation_30d is between -1 and 1; zero_crossing is boolean

---

## Proof of Execution Requirements

1. Code compiles / service starts without errors
2. All 3 verification tests pass
3. Route responds with correct shape
4. Smoke test: end-to-end flow from price APIs -> log returns -> correlation calculation -> DB insert -> API response -> chart render with event markers
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

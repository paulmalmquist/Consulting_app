# FEATURE: Multi-Asset Regime Classifier Dashboard

**Origin:** Multi-Asset Regime Classifier (`ma-regime-classifier`) rotation on 2026-03-22
**Gap Category:** risk_model
**Priority Score:** 92 | **Cross-Vertical:** Yes
**Card ID:** c61eb780-f91d-462b-b2ad-fd0fcbba2c2a

## Context

### Why This Exists
During macro research rotations, Winston surfaces isolated signals (yield curve shape, credit spreads, SPX momentum) with no unified layer synthesizing them into a single regime state. Analysts must mentally reconcile 4–6 separate signal streams to determine whether conditions are Risk-On, Risk-Off, Transitional, or Stress — a step that is both error-prone and time-consuming.

### What Couldn't Be Done
Winston could not answer "what is the current market regime?" in a single query. There is no composite regime score, no confidence interval, no per-asset-class breakdown, and no historical regime timeline that a research session can reference before rotating into a segment.

### Segment Intelligence Brief Reference
`docs/market-intelligence/2026-03-22-ma-regime-classifier.md` (will be created by the market rotation engine on next run)

---

## Specification

### What It Does
Computes a composite multi-asset regime label and confidence score on a daily refresh cycle. Exposes a Winston dashboard widget showing: (1) current regime label with confidence band, (2) contributing signal breakdown by asset class, (3) 90-day regime history timeline, (4) cross-vertical implications panel. Any research rotation or copilot session can query the current regime via a lightweight API endpoint.

### Data Layer

**New Tables (additive only):**
```sql
-- Regime snapshot per calculation run
CREATE TABLE public.market_regime_snapshot (
  snapshot_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  business_id     uuid,
  calculated_at   timestamptz NOT NULL DEFAULT now(),
  regime_label    text NOT NULL CHECK (regime_label IN ('risk_on','risk_off','transitional','stress')),
  confidence      numeric(5,2) NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  signal_breakdown jsonb NOT NULL DEFAULT '{}',
  -- shape: { "equities": {"score": 0.72, "weight": 0.30, "signals": [...]},
  --          "rates":    {"score": 0.40, "weight": 0.25, "signals": [...]},
  --          "credit":   {"score": 0.55, "weight": 0.25, "signals": [...]},
  --          "crypto":   {"score": 0.61, "weight": 0.20, "signals": [...]} }
  cross_vertical_implications jsonb NOT NULL DEFAULT '{}',
  -- shape: { "repe": "...", "credit": "...", "pds": "..." }
  source_metrics  jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_market_regime_snapshot_calculated_at
  ON public.market_regime_snapshot (calculated_at DESC);

-- RLS: tenant-scoped read, service-role write
ALTER TABLE public.market_regime_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read_regime" ON public.market_regime_snapshot
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
```

**Data Sources:**
- **Equities signals:** SPX 50/200-day MA ratio, VIX level + 20-day z-score, SPX RSI(14) — via `fact_market_timeseries` (existing table, additive reads)
- **Rates signals:** 2s10s spread, 10Y yield vs. 12-month MA, Fed funds effective rate delta — via `fact_market_timeseries`
- **Credit signals:** HYG/LQD price ratio, CDX IG spread level — via external feed (FRED API `BAMLH0A0HYM2` + `BAMLC0A0CM`)
- **Crypto signals:** BTC 30-day return, BTC dominance, crypto/SPX 60-day beta — via `fact_market_timeseries`
- **Refresh cadence:** Daily at 6:00 AM UTC (after market data ingestion completes)

**Data Pipeline:**
```
FRED API + existing fact_market_timeseries
  → backend/app/services/market_regime_engine.py (scoring)
  → public.market_regime_snapshot (storage)
  → GET /api/v1/market/regime/latest (consumption)
  → RegimeClassifierWidget (frontend render)
```

---

### Backend

**New Service File(s):**
- `backend/app/services/market_regime_engine.py`
  - `compute_regime_snapshot(tenant_id: UUID | None) -> RegimeSnapshot`
    - Pulls latest signals from `fact_market_timeseries` and FRED API
    - Scores each asset class (0–1) using configurable thresholds
    - Computes weighted composite score → maps to regime label + confidence
    - Persists to `market_regime_snapshot`
    - Returns structured `RegimeSnapshot` dataclass
  - `get_latest_regime(tenant_id: UUID | None) -> RegimeSnapshot`
    - Reads most recent row from `market_regime_snapshot`
    - Returns cached snapshot (no recompute)

**New Route(s):**
- `GET /api/v1/market/regime/latest`
  - Request: `{ tenant_id?: uuid }` (query param)
  - Response:
    ```json
    {
      "snapshot_id": "uuid",
      "calculated_at": "ISO8601",
      "regime_label": "risk_on | risk_off | transitional | stress",
      "confidence": 74.5,
      "signal_breakdown": {
        "equities": { "score": 0.72, "weight": 0.30, "signals": [...] },
        "rates":    { "score": 0.40, "weight": 0.25, "signals": [...] },
        "credit":   { "score": 0.55, "weight": 0.25, "signals": [...] },
        "crypto":   { "score": 0.61, "weight": 0.20, "signals": [...] }
      },
      "cross_vertical_implications": {
        "repe": "Risk-Off regime signals cap rate compression pressure — monitor CMBS spreads",
        "credit": "Credit stress signals elevated — tighten underwriting thresholds",
        "pds": "Construction pipeline demand may soften — watch starts data"
      }
    }
    ```
- `GET /api/v1/market/regime/history`
  - Request: `{ days?: int = 90, tenant_id?: uuid }`
  - Response: `{ snapshots: RegimeSnapshot[] }` ordered by `calculated_at DESC`

**Dependencies:**
- `httpx` (already available) — FRED API calls
- `FRED_API_KEY` env var (add to Railway + Vercel env)
- No new pip packages required if `httpx` is present

---

### Frontend

**New Component:**
- Name: `RegimeClassifierWidget`
- Location: `repo-b/src/components/market/RegimeClassifierWidget.tsx`
- Props:
  ```typescript
  interface RegimeClassifierWidgetProps {
    tenantId?: string;
    compact?: boolean; // true = badge only, false = full breakdown
  }
  ```

**Visualization:**
- **Regime badge:** Color-coded pill (green=risk_on, yellow=transitional, red=risk_off, dark red=stress) with confidence %
- **Signal breakdown:** Horizontal bar chart per asset class — each bar shows 0–1 score with weight label
- **History timeline:** 90-day strip chart (recharts `AreaChart`) with regime color bands — library: `recharts`
- **Cross-vertical panel:** 3 callout cards (REPE / Credit / PDS) with implication text
- **Interaction:** Hover on history timeline shows regime label + date; click signal bar shows constituent signals

**Integration Point:**
- **Primary:** Market Intelligence tab in Winston dashboard — top-of-page regime banner
- **Secondary:** Any copilot session context panel when market research is active
- **Navigation:** Dashboard → Market Intelligence → Regime tab (new tab, additive)

---

### Cross-Vertical Hooks

- **→ REPE:** Regime label surfaces as context in REPE underwriting sessions — "Current macro regime: Risk-Off (74% confidence). CMBS spreads elevated. Stress-test cap rate assumptions."
- **→ Credit:** Risk-Off / Stress regime triggers a tightening advisory in the credit decisioning walled garden — passed as context, not as a hard rule override
- **→ PDS:** Regime signal feeds the PDS market conditions summary — construction pipeline demand context

---

## Verification

1. **API response test:** `GET /api/v1/market/regime/latest` returns a JSON body with `regime_label` in `['risk_on','risk_off','transitional','stress']`, `confidence` between 0–100, and a `signal_breakdown` object with keys `equities`, `rates`, `credit`, `crypto`. HTTP 200.
2. **Persistence test:** After running `compute_regime_snapshot()`, a new row exists in `public.market_regime_snapshot` with `calculated_at` within 60 seconds of now and `confidence > 0`.
3. **Frontend render test:** `RegimeClassifierWidget` renders without error in both `compact=true` (badge only) and `compact=false` (full breakdown) modes; the recharts history timeline renders at least one data point when the snapshot table has ≥1 row.

---

## Proof of Execution Requirements

1. Code compiles / service starts without errors
2. All 3 verification tests pass
3. Route responds with correct shape
4. Smoke test: `compute_regime_snapshot()` → row in DB → `GET /api/v1/market/regime/latest` → `RegimeClassifierWidget` renders regime label
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
- market_regime_snapshot: new table only
- market_regime_engine.py: new file only
- New routes are additive endpoints
- RegimeClassifierWidget: new component only
```

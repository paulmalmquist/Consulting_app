# FEATURE: Volatility Surface Viewer & Skew Monitor

**Origin:** Volatility Surface Analysis (`dr-vol-surface`) rotation on 2026-03-22
**Gap Category:** visualization
**Priority Score:** 87 | **Cross-Vertical:** No
**Card ID:** c8b52caa-9f34-4746-bd66-a1b1b7572939

## Context

### Why This Exists
During derivatives rotation sessions, Winston has no way to render options market structure data. Analysts researching volatility regime shifts — a key input for equity risk positioning, hedging cost assessment, and regime classification — must leave the platform entirely to access vol surface tools (e.g., Bloomberg, Market Chameleon, CBOE data). This creates a workflow discontinuity that undermines the platform's value as a unified research environment.

### What Couldn't Be Done
Winston could not visualize the implied volatility surface for SPX or single-name tickers. It could not surface skew percentile rank (how expensive put protection is vs. history), display the vol term structure, or show put/call ratio overlays — all of which are standard inputs to a professional options or macro research workflow.

### Segment Intelligence Brief Reference
`docs/market-intelligence/2026-03-22-dr-vol-surface.md` (will be created by the market rotation engine on next run)

---

## Specification

### What It Does
Renders an interactive volatility surface visualization for user-selected underlying tickers. Displays: (1) 2D vol surface heatmap (strike × expiry grid, color = IV level), (2) term structure line chart (ATM IV by expiry), (3) skew chart (25-delta put IV vs. 25-delta call IV by expiry), (4) skew percentile rank vs. 252-day history, (5) put/call open interest ratio by expiry. Refreshes on demand or on a 15-minute polling cycle during market hours.

### Data Layer

**New Tables (additive only):**
```sql
-- Stores vol surface snapshots per ticker per pull
CREATE TABLE public.vol_surface_snapshot (
  snapshot_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  ticker          text NOT NULL,
  pulled_at       timestamptz NOT NULL DEFAULT now(),
  underlying_price numeric(12,4),
  surface_data    jsonb NOT NULL DEFAULT '[]',
  -- shape: [{ strike: 4500, expiry: "2026-04-17", iv: 0.182, delta: -0.25,
  --           oi: 12400, volume: 3200, option_type: "put" }, ...]
  term_structure  jsonb NOT NULL DEFAULT '[]',
  -- shape: [{ expiry: "2026-04-17", atm_iv: 0.182, days_to_exp: 26 }, ...]
  skew_data       jsonb NOT NULL DEFAULT '[]',
  -- shape: [{ expiry: "2026-04-17", put25d_iv: 0.21, call25d_iv: 0.155 }, ...]
  skew_percentile_rank numeric(5,2),
  put_call_ratio  numeric(8,4),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_vol_surface_ticker_pulled
  ON public.vol_surface_snapshot (ticker, pulled_at DESC);

ALTER TABLE public.vol_surface_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read_vol_surface" ON public.vol_surface_snapshot
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
```

**Data Sources:**
- **Primary:** Tradier API (`GET /markets/options/chains`) — options chain data including IV, OI, volume per strike/expiry
  - Env var: `TRADIER_API_KEY`
  - Free tier covers SPX surrogate (SPY), QQQ, and 250+ single-names
- **Fallback:** Yahoo Finance `yfinance` options chain (no API key required, rate-limited)
- **Skew percentile:** Computed from 252 rolling days of stored `vol_surface_snapshot` rows
- **Refresh cadence:** On-demand + background 15-min poll during market hours (9:30 AM–4:00 PM ET weekdays)

**Data Pipeline:**
```
Tradier API (or yfinance fallback)
  → backend/app/services/vol_surface_service.py (fetch + normalize)
  → public.vol_surface_snapshot (storage)
  → GET /api/v1/market/vol-surface/{ticker} (consumption)
  → VolSurfaceViewer (frontend render)
```

---

### Backend

**New Service File(s):**
- `backend/app/services/vol_surface_service.py`
  - `fetch_and_store_surface(ticker: str, tenant_id: UUID | None) -> VolSurfaceSnapshot`
    - Calls Tradier (or yfinance) for full options chain
    - Normalizes into surface_data, term_structure, skew_data formats
    - Computes skew_percentile_rank from 252-day rolling history in DB
    - Persists to `vol_surface_snapshot`
    - Returns structured `VolSurfaceSnapshot` dataclass
  - `get_latest_surface(ticker: str, tenant_id: UUID | None) -> VolSurfaceSnapshot | None`
    - Reads most recent snapshot for ticker; triggers fresh fetch if >15 min old during market hours

**New Route(s):**
- `GET /api/v1/market/vol-surface/{ticker}`
  - Request path: `ticker` (e.g., `SPY`, `AAPL`)
  - Query params: `{ force_refresh?: bool = false, tenant_id?: uuid }`
  - Response:
    ```json
    {
      "snapshot_id": "uuid",
      "ticker": "SPY",
      "pulled_at": "ISO8601",
      "underlying_price": 512.34,
      "term_structure": [
        { "expiry": "2026-04-17", "atm_iv": 0.182, "days_to_exp": 26 }
      ],
      "skew_data": [
        { "expiry": "2026-04-17", "put25d_iv": 0.21, "call25d_iv": 0.155 }
      ],
      "skew_percentile_rank": 68.2,
      "put_call_ratio": 1.34,
      "surface_data": [ ... ]
    }
    ```

**Dependencies:**
- `yfinance` — `pip install yfinance` (fallback data source, no API key)
- `TRADIER_API_KEY` env var (optional but preferred for production quality data)
- `httpx` (already available)

---

### Frontend

**New Component:**
- Name: `VolSurfaceViewer`
- Location: `repo-b/src/components/market/VolSurfaceViewer.tsx`
- Props:
  ```typescript
  interface VolSurfaceViewerProps {
    defaultTicker?: string; // default: "SPY"
    tenantId?: string;
  }
  ```

**Visualization:**
- **Surface heatmap:** 2D grid (X = expiry, Y = strike as % of spot, color = IV) — rendered as CSS grid with color interpolation (no heavy 3D library needed; use `d3` color scale)
- **Term structure:** Line chart (ATM IV by expiry) — `recharts LineChart`
- **Skew chart:** Dual-line chart (25-delta put IV vs. call IV by expiry) — `recharts LineChart`
- **Skew rank badge:** Pill showing percentile rank with color (green <33rd, yellow 33–66th, red >66th)
- **Put/call ratio:** Single stat card
- **Ticker input:** Text input + "Load" button; debounced, uppercase-enforced
- **Interaction:** Hover on heatmap cell shows tooltip with exact strike/expiry/IV; click on term structure point highlights that expiry's skew in the skew chart

**Integration Point:**
- **Location:** Market Intelligence tab → Derivatives sub-tab (new tab, additive)
- **Navigation:** Dashboard → Market Intelligence → Derivatives → Vol Surface

---

### Cross-Vertical Hooks

Not applicable for initial build. Future enhancement: skew_percentile_rank > 80th percentile could surface a risk advisory in the credit decisioning context panel ("Options market pricing elevated tail risk — consider stress scenario weighting").

---

## Verification

1. **API data test:** `GET /api/v1/market/vol-surface/SPY` returns a JSON body with `term_structure` array containing ≥3 expiry entries, `skew_percentile_rank` between 0–100, and `put_call_ratio > 0`. HTTP 200.
2. **Persistence test:** After `fetch_and_store_surface("SPY", None)`, a row exists in `public.vol_surface_snapshot` with `ticker = 'SPY'` and `pulled_at` within 60 seconds of now.
3. **Frontend render test:** `VolSurfaceViewer` renders without error when provided mock surface data; the recharts term structure chart renders ≥1 line and the heatmap grid renders ≥1 colored cell.

---

## Proof of Execution Requirements

1. Code compiles / service starts without errors
2. All 3 verification tests pass
3. Route responds with correct shape
4. Smoke test: `fetch_and_store_surface("SPY")` → row in DB → `GET /api/v1/market/vol-surface/SPY` → `VolSurfaceViewer` renders heatmap and term structure
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
- vol_surface_snapshot: new table only
- vol_surface_service.py: new file only
- New routes are additive endpoints
- VolSurfaceViewer: new component only
```
